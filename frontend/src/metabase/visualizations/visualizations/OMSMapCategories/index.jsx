/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
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
import { OMSOlMap } from 'metabase/visualizations/components/OMSOlMap';

export interface IOMSMapProps extends VisualizationProps { }
export interface IOMSMapState { }

class OMSMapCategoriesComponent extends OMSOlMap<IOMSMapProps, IOMSMapState> {

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

        const mapParams = this.props.settings['olmapcategories.mapParams'];
        const prevMapParams = prevProps.settings['olmapcategories.mapParams'];

        if (JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) {
            this.updateMapState();
        }
    }

    getMapParams() {
        return this.props.settings['olmapcategories.mapParams'].map(n => Number(n));
    }

    getObjectValue(featureData) {
        const { settings } = this.props;
        return settings['olmapcategories.settings'] 
                ? featureData[settings['olmapcategories.settings'].column]
                : null;
    }

    getObjectColumn(seriesIndex) {
        const { series, settings } = this.props;
        return settings['olmapcategories.settings'] 
            ? series[seriesIndex].data.cols.find(c => c.name === settings['olmapcategories.settings'].column) 
            : null;
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

    geojsonToFeature(geojson) {
        const formatGeoJSON = new GeoJSONFormatter();
        const wkb = new WKB();

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
}

export const OMSMapCategories = OMSMapCategoriesComponent;
