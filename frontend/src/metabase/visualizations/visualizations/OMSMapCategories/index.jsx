/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import WKB from 'ol/format/WKB';
import Projection from 'ol/proj/Projection';
import { Fill, Stroke, Circle, Style, Text, Icon } from 'ol/style';
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
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import { getUniqueValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';
import { Row } from 'metabase-types/types/Dataset';
import { memoize } from 'metabase-lib/lib/utils';
import { OMSOlMap, defaultMapPositionConfig } from 'metabase/visualizations/components/OMSOlMap';
import { div } from 'grid-styled';

export interface IOMSMapProps extends VisualizationProps { }
export interface IOMSMapState { }

class OMSMapCategoriesComponent extends OMSOlMap<IOMSMapProps, IOMSMapState> {

    static settings: { [k: string]: SettingDef; } = {
        'olmapcategories.settings': {
            section: 'Данные',
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
        'olmapcategories.show_legend': {
            section: 'Данные',
            title: 'Легенда',
            widget: "toggle",
            default: false,
        },

        'olmapcategories.opacity': {
            section: 'Данные',
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },
        'olmapcategories.show_label': {
            section: 'Подпись',
            title: 'Показывать подпись',
            widget: "toggle",
            default: false,
        },
        ...fieldSetting("olmapcategories.label_column", {
            section: 'Подпись',
            title: 'Колонка',
            getDefault: ([{ data }]) => data.cols[0].name,
        }),
        'olmapcategories.label_font_size': {
            section: 'Подпись',
            title: 'Размер шрифта',
            widget: 'number',
            default: 14,
        },
        'olmapcategories.label_color': {
            section: 'Подпись',
            title: 'Цвет',
            widget: 'color',
            default: '#000000',
            getProps: () => ({
                fancy: true,
            })
        },
        ...OMSOlMap.getSettings('olmapcategories')
    };

    static isSensible({ cols, rows }) {
        return true;
    }

    static uiName = "ORBISmap Категории";
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

    updateLegend() {
        const { series, settings } = this.props;
        if (!settings['olmapcategories.show_legend'] || !settings['olmapcategories.settings']) {
            this.setState({ legend: null });
            return;
        }
        const rainbowSettings = settings['olmapcategories.settings'];
        const uniqueValues = getUniqueValues(series[0].data.rows, getColumnIndexByName(series[0].data.cols, rainbowSettings.column));
        const lRows = uniqueValues.map((v, i) => {
            let color = this.savedColors[v.value] || this.rainbow[i] || '#000000';
            const showIcons = (rainbowSettings.iconsPath && rainbowSettings.showIcons) ? rainbowSettings.showIcons : {};
            let icon = showIcons[v.value] ? rainbowSettings.iconsPath[v.value] : null;
            return {
                value: v.value,
                color,
                icon
            }
        });
        const config = {
            type: 'category',
            lRows
        }
        this.setState({ legend: config })
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
        const labelIndex = _.findIndex(cols, (column) => column.name === settings['olmapcategories.label_column']);
        const showLabel = settings['olmapcategories.show_label'];
        const labelFontSize = settings['olmapcategories.label_font_size'];
        const labelColor = settings['olmapcategories.label_color'];
        this._vectorLayer.getSource().clear();
        const iconsPath = settings['olmapcategories.settings'] ? settings['olmapcategories.settings'].iconsPath || {} : {};
        const showIcons = settings['olmapcategories.settings'] ? settings['olmapcategories.settings'].showIcons || {} : {};

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
            const label = String(row[labelIndex]);
            const showIcon = showIcons[row[this.selectedColumnIndex]];
            const iconPath = showIcon ? iconsPath[row[this.selectedColumnIndex]] : null;
            if (geoJSON === null) {
                continue;
            }
            const features = this.geojsonToFeature(geoJSON);
            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    
                    const color = this.getRainbowColorForRow(row);
                    const opacity = this.props.settings['olmapcategories.opacity'] || 100;

                    this.generateStyleForColor(color, opacity, showLabel, label, labelFontSize, labelColor, iconPath).then((style) => {
                        feature.setStyle(style);
                    })
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


    generatePointStyle(textStyle, colorWithOpacity, iconPath) {
        const circleStyle = new Circle({
            fill: new Fill({
                color: colorWithOpacity
            }),
            radius: 5,
            stroke: new Stroke({
                color: '#ffffff',
                width: 0.5
            }),
        });
        return new Promise((resolve, reject) => {
            if (iconPath) {
                const img = document.createElement('img');
                img.src = iconPath;
                img.onload = () => {
                    const imgStyle = new Icon({
                        img,
                        anchor: [img.width / 2, img.height / 2],
                        anchorXUnits : 'pixels',
                        anchorYUnits : 'pixels',
                        imgSize: [img.width, img.height],
                        size: [img.width, img.height]
                    })
                    resolve(new Style({
                        image: imgStyle,
                        text: textStyle
                    }))
                }
                img.onerror = () => {
                    resolve(new Style({
                        image: circleStyle,
                        text: textStyle
                    }));
                }
            } else {
                resolve(new Style({
                    image: circleStyle,
                    text: textStyle
                }));
            }
        })
    }

    @memoize
    generateStyleForColor(color: string, opacity: number, showLabel, label, labelSize, labelColor, iconPath) {
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

        return this.generatePointStyle(textStyle, colorWithOpacity, iconPath).then((pointStyle) => {
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

            styles[GeometryType.POINT] = [ pointStyle ];
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

            return function (feature: Feature) {
                const geom = feature.getGeometry();
                return geom ? (styles[geom.getType()] || []) : [];
            };
        })
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

    renderLegend() {
        const {legend} = this.state;
        return <div className={styles.omsMapCategoryLegend}>
            {legend.lRows.map((r) => (<div className={styles.omsMapCategoryLegendItem} key={r.value}>
                {r.icon 
                ? <div className={styles.omsMapCategoryLegendIcon}>
                    <img src={r.icon} />
                </div> 
                : <div className={styles.omsMapCategoryLegendColor} style={{ backgroundColor: r.color }} />}
                <div className={styles.omsMapCategoryLegendTitle}>{r.value}</div>
            </div>))}
        </div>
    }
}

export const OMSMapCategories = OMSMapCategoriesComponent;
