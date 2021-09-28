/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
import chroma from "chroma-js";
import OLMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import Projection from 'ol/proj/Projection';
import GeometryType from 'ol/geom/GeometryType';
import WKB from 'ol/format/WKB';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style } from 'ol/style';

import css from './style.css';

import { Row } from 'metabase-types/types/Dataset';
import { memoize } from 'metabase-lib/lib/utils';
import { isNotGeomColumn, isGeomColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSThematicMapColorScheme, getColorTheme } from 'metabase/visualizations/components/settings/OMSThematicMapColorScheme';
import { getUniqueValues, getValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';
import geostats from 'metabase/visualizations/lib/oms/geostats';
import { isNumeric } from "metabase/lib/schema_metadata";

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
class OMSMapThematicMapComponent extends React.Component {
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
            title: `Колонка`,
            fieldFilter: isNumeric
        }),

        'olmapthematicmap.algorithm': {
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
            title: 'Количество классов',
            widget: "number",
            default: 9,
            max: 100,
            min: 0
        },

        'olmapthematicmap.colors_number': {
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
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        }
    };

    static isSensible({ cols, rows }) {
        return true;
    }

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

        // const geom = formatGeoJSON.readFeatures(geojson, {
        //     dataProjection: new Projection({ code: "EPSG:3857" })
        // });

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
        this._vectorLayer.getSource().clear();

        if (geomColumnIndex === -1) {
            console.error('Ошибка получения колонки геометрии');
            return;
        }

        for (const row of rows) {
            const geoJSON = row[geomColumnIndex];

            if (geoJSON === null) {
                continue;
            }

            const features = this.geojsonToFeature(geoJSON);

            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    const color = this.getColorForValue(row[this.selectedColumnIndex]);
                    const opacity = this.props.settings['olmapthematicmap.opacity'] || 100;

                    feature.setStyle(this.generateStyleForColor(color, opacity));
                }
            } else {
                console.warn('this.selectedColumnIndex = ', this.selectedColumnIndex, settings);
            }

            this._vectorLayer.getSource().addFeatures(features);
        }
    }

    render() {
        return (
            <div
                className={css.omsMap}
                ref={el => this._mapMountEl = el}
            ></div>
        );
    }
}

export const OMSMapThematicMap = OMSMapThematicMapComponent;