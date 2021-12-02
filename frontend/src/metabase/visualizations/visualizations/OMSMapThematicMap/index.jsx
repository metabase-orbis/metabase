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
import { Fill, Stroke, Circle, Style, Text } from 'ol/style';
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
import { OMSOlMap, defaultMapPositionConfig } from 'metabase/visualizations/components/OMSOlMap';

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

    static uiName = "ORBISmap Тематическая карта";
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
        'olmapthematicmap.show_legend': {
            section: 'Данные',
            title: 'Легенда',
            widget: "toggle",
            default: false,
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
        'olmapthematicmap.show_label': {
            section: 'Подпись',
            title: 'Показывать подпись',
            widget: "toggle",
            default: false,
        },
        ...fieldSetting("olmapthematicmap.label_column", {
            section: 'Подпись',
            title: 'Колонка',
            getDefault: ([{ data }]) => data.cols[0].name,
        }),
        'olmapthematicmap.label_font_size': {
            section: 'Подпись',
            title: 'Размер шрифта',
            widget: 'number',
            default: 14,
        },
        'olmapthematicmap.label_color': {
            section: 'Подпись',
            title: 'Цвет',
            widget: 'color',
            default: '#000000',
            getProps: () => ({
                fancy: true,
            })
        },
        ...OMSOlMap.getSettings('olmapthematicmap')
    };

    static isSensible({ cols, rows }) {
        return true;
    }

    static checkRenderable([{ data, card }], settings, query) {
        const selectedColumnIndex = getColumnIndexByName(data.cols, settings['olmapthematicmap.column']);
        const uniqValues = getUniqueValues(data.rows, selectedColumnIndex);
        if (uniqValues.length <= settings['olmapthematicmap.classes_num']) {
            throw new Error( t`Количество классов не должно превышать количество уникальных значений`);
        }
    }

    constructor(props) {
        super(props);
    }

    componentDidMount() {
        super.componentDidMount();
        this.updateCategoryClasses();
        this.updateMarkers();
        this.updateLegend();
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);
        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        if (!sameSeries) {
            this.updateCategoryClasses();
            this.updateMarkers();
            this.updateLegend();
        }

        const mapParams = this.props.settings['olmapthematicmap.mapParams'];
        const prevMapParams = prevProps.settings['olmapthematicmap.mapParams'];
        const mapZoomRange = this.props.settings['olmapthematicmap.zoom_range'];
        const prevMapZoomRange = prevProps.settings['olmapthematicmap.zoom_range'];
        if ((JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) || 
            (JSON.stringify(mapZoomRange) !== JSON.stringify(prevMapZoomRange))) {
            this.updateMapState();
        }

        const mapUrl = this.props.settings['olmapthematicmap.base_maps_list'].mapUrl;
        const prevMapUrl = prevProps.settings['olmapthematicmap.base_maps_list'].mapUrl;
        if (mapUrl !== prevMapUrl) {
            this.setBaseMaps();
        }

        const baseMap = this.props.settings['olmapthematicmap.default_base_map'];
        const prevBaseMap = prevProps.settings['olmapthematicmap.default_base_map'];
        if (baseMap !== prevBaseMap) {
            this.setState({baseMapId: baseMap})
        }
    }

    getMapParams() {
        return this.props.settings['olmapthematicmap.mapParams'].map(n => Number(n));
    }

    getZoomRange() {
        const { min_zoom, max_zoom } = defaultMapPositionConfig;
        const zoomRange = this.props.settings['olmapthematicmap.zoom_range'] || [min_zoom, max_zoom]
        return zoomRange.map(n => Number(n));
    }

    getObjectValue(featureData) {
        const { settings } = this.props;
        return featureData[settings['olmapthematicmap.column']];
    }

    getObjectColumn(seriesIndex) {
        const { series, settings } = this.props;
        return series[seriesIndex].data.cols.find(c => c.name === settings['olmapthematicmap.column'])
    }

    getMapUrl() {
        return this.props.settings['olmapthematicmap.map_url'];
    }

    getBaseMaps() {
        return this.props.settings['olmapthematicmap.base_maps_list']
    }

    getDefaultBaseMap() {
        return this.props.settings['olmapthematicmap.default_base_map']
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

    updateLegend() {
        const { settings } = this.props;
        if (!settings['olmapthematicmap.show_legend']) {
            this.setState({ legend: null });
            return;
        }
        const algorithms = {
            [Algorithm.EqInterval]: this.classEqInterval,
            [Algorithm.Quantile]: this.classQuantile,
            [Algorithm.Jenks]: this.classJenks
        }
        const algorithmType = settings['olmapthematicmap.algorithm'];
        const algorithmValues = algorithms[algorithmType].map(n => Number(n.toFixed(2)));
        if (!algorithmValues) return;
        const config = {
            type: 'thematic',
            colors: this.classColors,
            min: algorithmValues[0],
            max: algorithmValues[algorithmValues.length - 1]
        };
        this.setState({ legend: config });
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
    generateStyleForColor(color, opacity, showLabel, label, labelSize, labelColor) {
        const [r, g, b, a] = colorAsArray(color);
        const colorWithOpacity = [r, g, b, opacity / 100];

        const textStyle = showLabel 
        ?  new Text({
            font: `${labelSize}px sans-serif`,
            text: label,
            fill:  new Fill({
                color: labelColor
            }),
            stroke: new Stroke({
                color: '#ffffff',
                width: 0.5
            }),
        }) : null;

        const styles = {};
        styles[GeometryType.LINE_STRING] = [
            new Style({
                stroke: new Stroke({
                    color: colorWithOpacity,
                    width: 2
                }),
                text: textStyle
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
                text: textStyle
            })
        ];
        styles[GeometryType.MULTI_POINT] = styles[GeometryType.POINT];

        styles[GeometryType.POLYGON] = [
            new Style({
                fill: new Fill({
                    color: colorWithOpacity
                }),
                text: textStyle
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
        const labelIndex = _.findIndex(cols, (column) => column.name === settings['olmapthematicmap.label_column']);
        const showLabel = settings['olmapthematicmap.show_label'];
        const labelFontSize = settings['olmapthematicmap.label_font_size'];
        const labelColor = settings['olmapthematicmap.label_color'];
        this._vectorLayer.getSource().clear();

        if (geomColumnIndex === -1) {
            console.error('Ошибка получения колонки геометрии');
            return;
        }

        for (const row of rows) {
            const geoJSON = row[geomColumnIndex];
            const id = row[idColumnIndex];
            const label = String(row[labelIndex]);
            if (geoJSON === null) {
                continue;
            }

            const features = this.geojsonToFeature(geoJSON);

            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    const color = this.getColorForValue(row[this.selectedColumnIndex]);
                    const opacity = this.props.settings['olmapthematicmap.opacity'] || 100;
                    
                    feature.setStyle(this.generateStyleForColor(color, opacity, showLabel, label, labelFontSize, labelColor));
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

    renderLegend() {
        const { legend } = this.state;
        return <div className={css.omsMapThematicLegend}>
            <div className={css.omsMapThematicLegendColors}>
                {legend.colors.map(c => <div style={{backgroundColor: c}} key={c} />)}
            </div>
            <div className={css.omsMapThematicLegendValues}>
                <span>{legend.min}</span>
                <span>{legend.max}</span>
            </div>
        </div>
    }
}

export const OMSMapThematicMap = OMSMapThematicMapComponent;