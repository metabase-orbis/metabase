/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
import OLMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import WKB from 'ol/format/WKB';
import Projection from 'ol/proj/Projection';
import { Fill, Stroke, Circle, Style } from 'ol/style';
import Feature from 'ol/Feature';
import GeometryType from 'ol/geom/GeometryType';
import { asArray as colorAsArray } from 'ol/color';
import { isSameSeries, getOlFeatureInfoFromSeries, getOlFeatureOnPixel  } from "metabase/visualizations/lib/utils";
import { isGeomColumn, isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { generateRainbow } from 'metabase/visualizations/lib/oms/colors';
import View from 'ol/View';
import { transform } from 'ol/proj';
import {
    OMSCategoryClassesSettings,
    TCategoriesSettings
} from 'metabase/visualizations/components/settings/OMSCategoryClasses';

import styles from './style.css';

import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { SettingDef } from 'metabase/visualizations/lib/settings';
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import { getUniqueValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';
import { Row } from 'metabase-types/types/Dataset';
import { memoize } from 'metabase-lib/lib/utils';

export interface IOMSMapProps extends VisualizationProps { }
export interface IOMSMapState { }

class OMSMapCategoriesComponent extends React.Component<IOMSMapProps, IOMSMapState> {

    static settings: { [k: string]: SettingDef; } = {
        'olmapcategories.settings': {
            title: 'Классы',
            widget: OMSCategoryClassesSettings,
            getProps: (
                [{ data }],
                { 'olmapcategories.settings': settings = {} }: { 'olmapcategories.settings': TCategoriesSettings; }
            ) => {
                const uniqueValues = getUniqueValues(data.rows, getColumnIndexByName(data.cols, settings.column));

                return {
                    cols: data.cols,
                    uniqueValues: uniqueValues,
                    rainbow: generateRainbow(uniqueValues.length)
                };
            },
        },

        'olmapcategories.opacity': {
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },
        'olmapcategories.mapParams': {
            title: 'Параметры карты',
            widget: OMSInputGroup,
            names: ['Масштаб', 'Координаты центра'],
            default: [2, 0, 0],
            types: ['number', 'number', 'number'],
            setValueTitle: 'Текущая позиция карты'
        },
    };

    static isSensible({ cols, rows }) {
        return true;
    }

    static uiName = "OMS Категории";
    static identifier = "olmapcategories";
    static iconName = "location";

    _map: Map;
    _vectorLayer = new VectorLayer({
        source: new VectorSource()
    });
    _mapMountEl: HTMLDivElement;

    /* Индекс выбранной колонки. Используется для получения значения колонки из строки таблицы */
    selectedColumnIndex: number;
    /* Уникальные значения */
    uniqueValues: {
        /** Уникальное значение */
        value: any;
        /** Сколько раз значение value встречается во всех строках таблицы */
        count: number;
    }[];
    /** Цвета, которые сгенерирует клиент для всех уникальных значений. По длине совпадает с uniqueValues */
    rainbow: string[];
    /** Цвета, которые были перезаписаны в настройках визуализации. Ключ - value, Значение - цвет, на который был перезаписан */
    savedColors: { [k: string]: string; };
    /** Если какое-то из value будет в этом массиве, то у него должна быть снята галочка и отрисовываться на карте это значение не должно */
    uncheckedValues: any[];

    constructor(props: IOMSMapProps) {
        super(props);
        this.onMapClick = this.onMapClick.bind(this);
    }

    componentDidMount() {
        const mapParams = this.props.settings['olmapcategories.mapParams'].map(n => Number(n));
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

        if (!sameSeries) {
            this.updateCategoryClasses();
            this.updateMarkers();
        }

        const mapParams = this.props.settings['olmapcategories.mapParams'];
        const prevMapParams = prevProps.settings['olmapcategories.mapParams'];

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
        const {series, settings} = this.props;
        if (!featureData) return null;
        let data = [];
        let dimensions = [];
        let value = settings['olmapcategories.settings'] 
            ? featureData[settings['olmapcategories.settings'].column]
            : null;
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
        const column = settings['olmapcategories.settings'] 
            ? series[seriesIndex].data.cols.find(c => c.name === settings['olmapcategories.settings'].column) 
            : null;
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
        const settings: TCategoriesSettings = this.props.settings['olmapcategories.settings'] || {};
        const {
            savedColors = {},
            uncheckedValues = []
        } = settings;


        this.selectedColumnIndex = getColumnIndexByName(cols, settings.column);
        this.uniqueValues = getUniqueValues(rows, this.selectedColumnIndex);
        this.rainbow = generateRainbow(this.uniqueValues.length);
        this.savedColors = savedColors;
        this.uncheckedValues = uncheckedValues;
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
            if (this.isRowExcluded(row)) {
                continue;
            }

            const geoJSON = row[geomColumnIndex];
            const id = row[idColumnIndex];
            if (geoJSON === null) {
                continue;
            }

            const features = this.geojsonToFeature(geoJSON);
            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    const color = this.getRainbowColorForRow(row);
                    const opacity = this.props.settings['olmapcategories.opacity'] || 100;

                    feature.setStyle(this.generateStyleForColor(color, opacity));
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
        const mapParams = this.props.settings['olmapcategories.mapParams'];
        const projection = this._map.getView().getProjection().getCode();
        const center = transform([mapParams[1], mapParams[2]], 'EPSG:4326', projection);
        this._map.getView().setZoom(mapParams[0]);
        this._map.getView().setCenter(center);
    }

    geojsonToFeature(geojson) {
        const formatGeoJSON = new GeoJSONFormatter();
        const wkb = new WKB();

        // const geom = formatGeoJSON.readFeatures(geojson, {
        //     dataProjection: new Projection({ code: "EPSG:3857" })
        // });

        const geom = wkb.readFeatures(geojson, {
            dataProjection: new Projection({ code: "EPSG:3857" })
        });

        return geom;
    }

    @memoize
    generateStyleForColor(color: string, opacity: number) {
        const [r, g, b, a] = colorAsArray(color);
        const colorWithOpacity = [r, g, b, opacity / 100];

        const styles = {};
        styles[GeometryType.LINE_STRING] = [
            new Style({
                stroke: new Stroke({
                    color: colorWithOpacity,
                    width: 2
                })
            })
        ];
        styles[GeometryType.MULTI_LINE_STRING] = styles[GeometryType.LINE_STRING];

        styles[GeometryType.POINT] = [
            new Style({
                image: new Circle({
                    fill: new Fill({
                        color: colorWithOpacity
                    }),
                    radius: 5
                }),
            })
        ];
        styles[GeometryType.MULTI_POINT] = styles[GeometryType.POINT];

        styles[GeometryType.POLYGON] = [
            new Style({
                fill: new Fill({
                    color: colorWithOpacity
                })
            })
        ];
        styles[GeometryType.MULTI_POLYGON] = styles[GeometryType.POLYGON];

        return function (feature: Feature) {
            const geom = feature.getGeometry();
            return geom ? (styles[geom.getType()] || []) : [];
        };
    }

    getRainbowColorForRow(row: Row) {
        if (this.selectedColumnIndex === -1) {
            return '#000000';
        }

        const value = row[this.selectedColumnIndex];
        const valueIndex = _.findIndex(this.uniqueValues, (v) => v.value === value);

        if (valueIndex === -1) {
            return '#000000';
        } else {
            if (value in this.savedColors) {
                return this.savedColors[value];
            } else {
                return this.rainbow[valueIndex];
            }
        }
    }

    isRowExcluded(row: Row): boolean {
        const value = row[this.selectedColumnIndex];
        return this.uncheckedValues.includes(value);
    }

    render() {
        const { onHoverChange } = this.props;
        return (
            <div
                className={styles.omsMap}
                ref={el => this._mapMountEl = el}
                onMouseLeave={() => onHoverChange && onHoverChange(null)}
            ></div>
        );
    }
}

export const OMSMapCategories = OMSMapCategoriesComponent;
