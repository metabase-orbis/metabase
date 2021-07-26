/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
import OLMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import Projection from 'ol/proj/Projection';
/* eslint-disable-next-line */
import centerOfMass from '@turf/center-of-mass';
import GeometryType from 'ol/geom/GeometryType';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style } from 'ol/style';
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
import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSNumberRange } from 'metabase/visualizations/components/settings/OMSNumberRange';
import { memoize } from 'metabase-lib/lib/utils';
import { isNotGeomColumn, isGeomColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { getUniqueValues, getValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';

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

    constructor(props) {
        super(props);
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
            default: 9,
            max: 100,
            min: 0
        },

        'omsmapbubble.size': {
            title: 'Размер',
            widget: OMSNumberRange,
            default: [10, 50],
            max: 100,
            min: 1
        },
    };

    componentDidMount() {
        this._map = new OLMap({
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),
                this._vectorLayer
            ],
            target: this._mapMountEl,
            view: new View({
                center: [0, 0],
                zoom: 2,
            }),
        });

        this.updateCategoryClasses();
        this.updateMarkers();
    }

    componentDidUpdate(prevProps, prevState) {
        const sameSeries = isSameSeries(this.props.series, prevProps.series);
        const sameSize =
            this.props.width === prevProps.width &&
            this.props.height === prevProps.height;

        if (!sameSeries) {
            this.updateCategoryClasses();
            this.updateMarkers();
        }

        if (!sameSize) {
            this._map.updateSize();
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        const sameSize =
            this.props.width === nextProps.width &&
            this.props.height === nextProps.height;
        const sameSeries = isSameSeries(this.props.series, nextProps.series);
        return !sameSize || !sameSeries;
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

    geojsonToFeature(geojsonString) {
        const geoJSONParsed = JSON.parse(geojsonString);
        // toEPSG4326(geoJSONParsed, { mutate: true });

        const center = centerOfMass(geoJSONParsed);
        // toEPSG3857(centroid, { mutate: true });

        // const _temp_geom_ = {
        //     "type": "FeatureCollection",
        //     "features": [
        //         {
        //             "type": "Feature",
        //             "geometry": JSON.parse(geojsonString)
        //         },
        //         center
        //     ]
        // };

        const formatGeoJSON = new GeoJSONFormatter();
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
        this._vectorLayer.getSource().clear();

        if (geomColumnIndex === -1) {
            console.error('Ошибка получения колонки геометрии');
            return;
        }

        for (const row of rows) {
            const geoJSON = row[geomColumnIndex];
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
                }
            } else {
                console.warn('this.selectedColumnIndex = ', this.selectedColumnIndex, settings);
            }

            this._vectorLayer.getSource().addFeatures(features);
        }
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
        return (
            <div
                className={styles.omsMap}
                ref={el => this._mapMountEl = el}
            ></div>
        );
    }
}

export const OMSMapBubble = OMSMapBubbleComponent;