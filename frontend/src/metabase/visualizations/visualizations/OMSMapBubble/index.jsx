/* eslint-disable react/prop-types */
import * as React from 'react';
import { t, jt } from "ttag";
import _ from 'underscore';
import OLMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import WKB from 'ol/format/WKB';
import Projection from 'ol/proj/Projection';
/* eslint-disable-next-line */
import centerOfMass from '@turf/center-of-mass';
import GeometryType from 'ol/geom/GeometryType';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style } from 'ol/style';
import { transform } from 'ol/proj';
import geostats from 'metabase/visualizations/lib/oms/geostats';

import {
    isNumeric,
    isLatitude,
    isLongitude,
    isMetric,
    hasLatitudeAndLongitudeColumns,
    isState,
    isCountry,
} from "metabase/lib/schema_metadata";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { isSameSeries, getOlFeatureInfoFromSeries, getOlFeatureOnPixel } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSNumberRange } from 'metabase/visualizations/components/settings/OMSNumberRange';
import { memoize } from 'metabase-lib/lib/utils';
import { isNotGeomColumn, isGeomColumn, isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { getUniqueValues, getValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';

import styles from './style.css';

const Algorithm = Object.freeze({
    EqInterval: 0,
    Quantile: 1,
    Jenks: 2
});

class OMSMapBubbleComponent extends React.Component {

    /**
     * @type {import('ol/Map')}
     */
    _map;
    _vectorLayer = new VectorLayer({
        source: new VectorSource()
    });

    /**
     * @type {HTMLDivElement}
     */
    _mapMountEl;

    /** 
     * @type {number}
     * Индекс выбранной колонки. Используется для получения значения колонки из строки таблицы 
     */
    selectedColumnIndex;

    geoStats;

    static uiName = "OMS Пузырьковые диаграммы";
    static identifier = "omsmapbubble";
    static iconName = "location";

    static isSensible({ cols, rows }) {
        return true;
    }

    static checkRenderable([{ data, card }], settings, query) {
        const selectedColumnIndex = getColumnIndexByName(data.cols, settings['omsmapbubble.column']);
        const uniqValues = getUniqueValues(data.rows, selectedColumnIndex);
        if (uniqValues.length <= settings['omsmapbubble.classes_num']) {
            throw new Error( t`The number of classes should not exceed the number of unique values.`);
        }
    }

    constructor(props) {
        super(props);
        this.onMapClick = this.onMapClick.bind(this);
    }

    static settings = {
        ...fieldSetting("omsmapbubble.column", {
            title: `Колонка`,
            fieldFilter: isNumeric
        }),

        "omsmapbubble.icon_color": {
            section: 'Иконка',
            title: 'Цвет иконки',
            widget: "color",
            default: '#000000',
            getProps: () => ({
                fancy: true,
            })
        },

        'omsmapbubble.opacity': {
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },

        'omsmapbubble.algorithm': {
            title: 'Алгоритм распределения',
            widget: "select",
            default: Algorithm.EqInterval,
            getProps: () => ({
                options: [
                    { value: Algorithm.EqInterval, name: "Равные интервалы" },
                    { value: Algorithm.Quantile, name: "Квантили" },
                    { value: Algorithm.Jenks, name: "Естественные границы" },
                ]
            })
        },

        'omsmapbubble.classes_num': {
            title: 'Количество классов',
            widget: "number",
            default: 0,
            getProps: ([{ card, data }]) => ({
                max: data.rows.length
            }),
            min: 0
        },

        'omsmapbubble.size': {
            title: 'Размер',
            widget: OMSNumberRange,
            default: [10, 50],
            max: 100,
            min: 1
        },
        'omsmapbubble.mapParams': {
            title: 'Параметры карты',
            widget: OMSInputGroup,
            names: ['Масштаб', 'Координаты центра'],
            default: [2, 0, 0],
            types: ['number', 'number', 'number'],
            setValueTitle: 'Текущая позиция карты'
        },
    };

    componentDidMount() {
        const mapParams = this.props.settings['omsmapbubble.mapParams'].map(n => Number(n));
        const [zoom, ...center] = mapParams;
        const trCenter = transform(center, 'EPSG:4326', 'EPSG:3857');
        this._map = new OLMap({
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),
                this._vectorLayer
            ],
            target: this._mapMountEl,
            view: new View({
                center: trCenter,
                zoom: zoom || 2,
            })
        });
        this._map.on('moveend', () => {
            const zoom = Math.round(this._map.getView().getZoom());
            const center_ = this._map.getView().getCenter();
            const projection = this._map.getView().getProjection().getCode();
            const center = transform(center_, projection, 'EPSG:4326').map(n => Number(n.toFixed(4)));
            if (this.props.onChangeMapState) {
                this.props.onChangeMapState({zoom, center});
            }
        })
        this.setInteractions();
        this.updateCategoryClasses();
        this.updateMarkers();
    }

    componentDidUpdate(prevProps, prevState) {
        const sameSeries = isSameSeries(this.props.series, prevProps.series);
        const sameSize =
            this.props.width === prevProps.width &&
            this.props.height === prevProps.height;

        const mapParams = this.props.settings['omsmapbubble.mapParams'];
        const prevMapParams = prevProps.settings['omsmapbubble.mapParams'];

        if (!sameSeries) {
            this.updateCategoryClasses();
            this.updateMarkers();
        }

        if (!sameSize) {
            this._map.updateSize();
        }
        if (JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) {
            this.updateMapState();
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        const sameSize =
            this.props.width === nextProps.width &&
            this.props.height === nextProps.height;
        const sameSeries = isSameSeries(this.props.series, nextProps.series);
        return !sameSize || !sameSeries;
    }

    setInteractions() {
        const {onHoverChange} = this.props;
        this._map.on('pointermove', (e) => {
            let feature = getOlFeatureOnPixel(this._map, e.pixel);
            if (feature) {
                if (onHoverChange) {
                    const data = getOlFeatureInfoFromSeries(feature, this.props.series);
                    onHoverChange(this.getObjectConfig(data, e));
                }
                this._mapMountEl.style.cursor = 'pointer';
            } else {
                if (onHoverChange) {
                    onHoverChange(null);
                }
                this._mapMountEl.style.cursor = 'default';
            }
        });
        
        this._map.on('click', this.onMapClick)
    }

    getObjectConfig(featureData, e) {
        const {series, settings, onVisualizationClick} = this.props;
        if (!featureData) return null;
        let data = [];
        let dimensions = [];
        let value = featureData[settings['omsmapbubble.column']];
        const seriesIndex = 0;
        const seriesData = series[seriesIndex].data || {};
        const cols = seriesData.cols;
        data = cols.map((c) => ({
            key: c.display_name || c.name,
            value: featureData[c.name],
            col: c
        }));
        dimensions = cols.map((c) => ({
            column: c,
            value: featureData[c.name]
        }));
        const column = series[seriesIndex].data.cols.find(c => c.name === settings['omsmapbubble.column'])
        
        return {
            index: -1,
                element: null,
                event: e.originalEvent,
                data,
                dimensions,
                value,
                column,
                settings,
                seriesIndex
        }
    }

    onMapClick(e) {
        const { onVisualizationClick } = this.props;
        let feature = getOlFeatureOnPixel(this._map, e.pixel);
        if (!feature) return;
        const data = getOlFeatureInfoFromSeries(feature, this.props.series);
        if (onVisualizationClick) {
            onVisualizationClick(this.getObjectConfig(data, e));
        }
    }

    updateCategoryClasses() {
        const { cols, rows } = this.props.data;


        const classesNum = this.props.settings['omsmapbubble.classes_num'];

        this.selectedColumnIndex = getColumnIndexByName(cols, this.props.settings['omsmapbubble.column']);

        this.geoStats = new geostats(getValues(rows, this.selectedColumnIndex));
        this.classEqInterval = this.geoStats.getClassEqInterval(classesNum);
        this.classQuantile = this.geoStats.getClassQuantile(classesNum);
        this.classJenks = this.geoStats.getClassJenks(classesNum);
    }

    geojsonToFeature(wkbBuff) {
        // const geoJSONParsed = JSON.parse(geojsonString);
        const formatGeoJSON = new GeoJSONFormatter();
        const wkb = new WKB();

        const feature = wkb.readFeature(wkbBuff, {
            dataProjection: new Projection({ code: "EPSG:3857" })
        });

        const geoJson = formatGeoJSON.writeFeatureObject(feature);
        
        const center = centerOfMass(geoJson.geometry);

        const features = formatGeoJSON.readFeatures(JSON.stringify(center), {
            dataProjection: new Projection({ code: "EPSG:3857" })
        });

        return features;
    }

    /**
     * @param {string} color 
     * @param {number} opacity 
     * @param {number} radius
     */
    @memoize
    generateStyleForColor(color, opacity, radius) {
        const [r, g, b, a] = colorAsArray(color);
        const colorWithOpacity = [r, g, b, opacity / 100];

        return new Style({
            image: new Circle({
                fill: new Fill({
                    color: colorWithOpacity
                }),
                radius: radius
            }),
        });
    }

    updateMarkers() {
        const { settings, series, data } = this.props;
        const { rows, cols } = data;
        const geomColumnIndex = _.findIndex(cols, isGeomColumn);
        const idColumnIndex = _.findIndex(cols, isIdColumn);
        this._vectorLayer.getSource().clear();

        if (geomColumnIndex === -1) {
            console.error('Ошибка получения колонки геометрии');
            return;
        }

        for (const row of rows) {
            const geoJSON = row[geomColumnIndex];
            const id = row[idColumnIndex];
            const rowValue = row[this.selectedColumnIndex];

            if (geoJSON === null || typeof rowValue !== 'number') {
                continue;
            }

            
            const features = this.geojsonToFeature(geoJSON);

            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    const color = this.props.settings['omsmapbubble.icon_color'];
                    const opacity = this.props.settings['omsmapbubble.opacity'];

                    const iconRadius = this.getIconSizeForValue(rowValue);

                    feature.setStyle(this.generateStyleForColor(color, opacity, iconRadius));
                    feature.set('id', id);
                }
            } else {
                for (const feature of features) {
                    feature.set('id', id);
                }
                console.warn('this.selectedColumnIndex = ', this.selectedColumnIndex, settings);
            }

            this._vectorLayer.getSource().addFeatures(features);
        }
    }

    updateMapState() {
        const mapParams = this.props.settings['omsmapbubble.mapParams'];
        const projection = this._map.getView().getProjection().getCode();
        const center = transform([mapParams[1], mapParams[2]], 'EPSG:4326', projection);
        this._map.getView().setZoom(mapParams[0]);
        this._map.getView().setCenter(center);
    }

    getIconSizeForValue(value) {
        const algorithm = this.props.settings['omsmapbubble.algorithm'];
        const classesNum = this.props.settings['omsmapbubble.classes_num'];
        const [minimalIconSize, maximumIconSize] = this.props.settings['omsmapbubble.size'];
        let ranges;
        switch (algorithm) {
            case Algorithm.EqInterval:
                ranges = this.classEqInterval;
                break;
            case Algorithm.Quantile:
                ranges = this.classQuantile;
                break;
            case Algorithm.Jenks:
                ranges = this.classJenks;
                break;
            default:
                console.warn('Не найден алгоритм ', algorithm);
                return 5;
        }

        const step = (maximumIconSize - minimalIconSize) / (classesNum - 1);

        let radius = 0;
        for (let i = 0, accStep = minimalIconSize; i < ranges.length - 1; i++, accStep += step) {
            const rangeVal = ranges[i];

            if (i === 0) {
                if (value >= rangeVal) {
                    radius = accStep;
                }
            } else {
                if (value > rangeVal) {
                    radius = accStep;
                }
            }
        }

        // Вернуть нужно диаметр
        return radius / 2;
    }

    render() {
        const {onHoverChange} = this.props;
        return (
            <div
                className={styles.omsMap}
                ref={el => this._mapMountEl = el}
                onMouseLeave={() => onHoverChange && onHoverChange(null)}
            ></div>
        );
    }
}

export const OMSMapBubble = OMSMapBubbleComponent;