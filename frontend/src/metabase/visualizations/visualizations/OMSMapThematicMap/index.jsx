/* eslint-disable react/prop-types */
import * as React from 'react';
import { t, jt } from "ttag";
import _ from 'underscore';
import chroma from "chroma-js";
import GeoJSONFormatter from 'ol/format/GeoJSON';
import Projection from 'ol/proj/Projection';
import GeometryType from 'ol/geom/GeometryType';
import WKB from 'ol/format/WKB';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style } from 'ol/style';
import { transform } from 'ol/proj';

import css from './style.css';

import { Row } from 'metabase-types/types/Dataset';
import { memoize } from 'metabase-lib/lib/utils';
import { isNotGeomColumn, isGeomColumn, isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { isSameSeries, getOlFeatureInfoFromSeries, getOlFeatureOnPixel } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSThematicMapColorScheme, getColorTheme } from 'metabase/visualizations/components/settings/OMSThematicMapColorScheme';
import { getUniqueValues, getValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';
import geostats from 'metabase/visualizations/lib/oms/geostats';
import { isNumeric } from "metabase/lib/schema_metadata";
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import { OMSOlMap } from 'metabase/visualizations/components/OMSOlMap';

const Algorithm = Object.freeze({
    EqInterval: 0,
    Quantile: 1,
    Jenks: 2
});

/**
 * @typedef IOMSMapProps
 */

/**
 * @typedef IOMSMapState
 */

/**
 * @extends {React.Component<import('metabase-types/types/Visualization').VisualizationProps & IOMSMapProps, IOMSMapState>}
 */
class OMSMapThematicMapComponent extends OMSOlMap {

    static uiName = "OMS Тематическая карта";
    static identifier = "olmapthematicmap";
    static iconName = "location";

    /** 
     * @type {number}
     * Индекс выбранной колонки. Используется для получения значения колонки из строки таблицы 
     */
    selectedColumnIndex;

    geoStats;

    /**
     * @type {{ [k: string]: import('metabase/visualizations/lib/settings').SettingDef; }}
     */
    static settings = {
        ...fieldSetting("olmapthematicmap.column", {
            section: 'Данные',
            title: `Колонка`,
            fieldFilter: isNumeric
        }),

        'olmapthematicmap.algorithm': {
            section: 'Данные',
            title: 'Алгоритм',
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

        'olmapthematicmap.classes_num': {
            section: 'Данные',
            title: 'Количество классов',
            widget: "number",
            default: 0,
            getProps: ([{ card, data }]) => ({
                max: data.rows.length - 1
            }),
            min: 0
        },

        'olmapthematicmap.colors_number': {
            section: 'Отображение',
            title: 'Палитра',
            widget: "select",
            default: 3,
            getProps: (object, settings, onChange) => ({
                options: [
                    { value: 2, name: "2 цвета" },
                    { value: 3, name: "3 цвета" },
                ]
            })
        },

        'olmapthematicmap.pallete': {
            section: 'Отображение',
            title: 'Цветовая схема',
            widget: OMSThematicMapColorScheme,
            default: 0,
            getProps: (series, { 'olmapthematicmap.colors_number': colorsNumber }) => {
                return {
                    palette: colorsNumber
                };
            }
        },

        'olmapthematicmap.opacity': {
            section: 'Отображение',
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },
        'olmapthematicmap.mapParams': {
            section: 'Карта',
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

    static checkRenderable([{ data, card }], settings, query) {
        const selectedColumnIndex = getColumnIndexByName(data.cols, settings['olmapthematicmap.column']);
        const uniqValues = getUniqueValues(data.rows, selectedColumnIndex);
        if (uniqValues.length <= settings['olmapthematicmap.classes_num']) {
            throw new Error( t`The number of classes should not exceed the number of unique values`);
        }
    }

    constructor(props) {
        super(props);
    }

    componentDidMount() {
        super.componentDidMount();
        this.updateCategoryClasses();
        this.updateMarkers();
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);
        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        if (!sameSeries) {
            this.updateCategoryClasses();
            this.updateMarkers();
        }

        const mapParams = this.props.settings['olmapthematicmap.mapParams'];
        const prevMapParams = prevProps.settings['olmapthematicmap.mapParams'];

        if (JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) {
            this.updateMapState();
        }
    }

    getMapParams() {
        return this.props.settings['olmapthematicmap.mapParams'].map(n => Number(n));
    }

    getObjectValue(featureData) {
        const { settings } = this.props;
        return featureData[settings['olmapthematicmap.column']];
    }

    getObjectColumn(seriesIndex) {
        const { series, settings } = this.props;
        return series[seriesIndex].data.cols.find(c => c.name === settings['olmapthematicmap.column'])
    }

    updateCategoryClasses() {
        const { cols, rows } = this.props.data;

        const colorsNumber = this.props.settings['olmapthematicmap.colors_number'];
        const paletteValue = this.props.settings['olmapthematicmap.pallete'];
        const classesNum = this.props.settings['olmapthematicmap.classes_num'];

        this.selectedColumnIndex = getColumnIndexByName(cols, this.props.settings['olmapthematicmap.column']);

        this.selectedColorTheme = getColorTheme(colorsNumber, paletteValue);

        this.geoStats = new geostats(getValues(rows, this.selectedColumnIndex));
        this.classEqInterval = this.geoStats.getClassEqInterval(classesNum);
        this.classQuantile = this.geoStats.getClassQuantile(classesNum);
        this.classJenks = this.geoStats.getClassJenks(classesNum);

        this.classColors = chroma.scale(this.selectedColorTheme).colors(classesNum);
    }

    geojsonToFeature(geojson) {
        const formatGeoJSON = new GeoJSONFormatter();
        const wkb = new WKB();

        const geom = wkb.readFeatures(geojson, {
            dataProjection: new Projection({ code: "EPSG:3857" })
        })

        return geom;
    }

    getColorForValue(value) {
        const algorithm = this.props.settings['olmapthematicmap.algorithm'];
        let color = '#000000';

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
                return color;
        }

        for (let i = 0; i < ranges.length; i++) {
            // Последнее значение обрабатывать не нужно
            if (i === ranges.length - 1) {
                break;
            }

            const rangeVal = ranges[i];

            if (i === 0) {
                if (value >= rangeVal) {
                    color = this.classColors[i];
                }
            } else {
                if (value > rangeVal) {
                    color = this.classColors[i];
                }
            }
        }

        return color;
    }

    /**
     * @param {string} color 
     * @param {number} opacity 
     * @returns {(feature: import('ol/Feature')) => import('ol/style/Style')[]}
     */
    @memoize
    generateStyleForColor(color, opacity) {
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

        return function (feature) {
            const geom = feature.getGeometry();
            return geom ? (styles[geom.getType()] || []) : [];
        };
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

            if (geoJSON === null) {
                continue;
            }

            const features = this.geojsonToFeature(geoJSON);

            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    const color = this.getColorForValue(row[this.selectedColumnIndex]);
                    const opacity = this.props.settings['olmapthematicmap.opacity'] || 100;
                    
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
}

export const OMSMapThematicMap = OMSMapThematicMapComponent;