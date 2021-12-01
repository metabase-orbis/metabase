/* eslint-disable react/prop-types */
import * as React from 'react';
import { t, jt } from "ttag";
import _ from 'underscore';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import WKB from 'ol/format/WKB';
import Projection from 'ol/proj/Projection';
/* eslint-disable-next-line */
import centerOfMass from '@turf/center-of-mass';
import GeometryType from 'ol/geom/GeometryType';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style, Text, Icon } from 'ol/style';
import { transform } from 'ol/proj';
import geostats from 'metabase/visualizations/lib/oms/geostats';

import { isNumeric } from "metabase/lib/schema_metadata";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSNumberRange } from 'metabase/visualizations/components/settings/OMSNumberRange';
import { memoize } from 'metabase-lib/lib/utils';
import { isNotGeomColumn, isGeomColumn, isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { getUniqueValues, getValues } from 'metabase/visualizations/lib/oms/get-values';
import { getColumnIndexByName } from 'metabase/visualizations/lib/oms/get-column-index';
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import { OMSOlMap } from 'metabase/visualizations/components/OMSOlMap';

import styles from './style.css';
import { resolve } from 'bluebird';

const Algorithm = Object.freeze({
    EqInterval: 0,
    Quantile: 1,
    Jenks: 2
});

class OMSMapBubbleComponent extends OMSOlMap {

    /** 
     * @type {number}
     * Индекс выбранной колонки. Используется для получения значения колонки из строки таблицы 
     */
    selectedColumnIndex;

    geoStats;

    static uiName = "ORBISmap Пузырьковые диаграммы";
    static identifier = "omsmapbubble";
    static iconName = "location";

    static isSensible({ cols, rows }) {
        return true;
    }

    static checkRenderable([{ data, card }], settings, query) {
        const selectedColumnIndex = getColumnIndexByName(data.cols, settings['omsmapbubble.column']);
        const uniqValues = getUniqueValues(data.rows, selectedColumnIndex);
        if (uniqValues.length <= settings['omsmapbubble.classes_num']) {
            throw new Error( t`Количество классов не должно превышать количество уникальных значений`);
        }
    }

    constructor(props) {
        super(props);
    }

    static settings = {
        ...fieldSetting("omsmapbubble.column", {
            section: 'Данные',
            title: `Колонка`,
            fieldFilter: isNumeric
        }),
        'omsmapbubble.show_legend': {
            section: 'Данные',
            title: 'Легенда',
            widget: "toggle",
            default: false,
        },

        "omsmapbubble.icon_color": {
            section: 'Иконка',
            title: 'Цвет иконки',
            widget: "color",
            default: '#000000',
            getProps: () => ({
                fancy: true,
            })
        },
        'omsmapbubble.icon_path': {
            section: 'Иконка',
            title: 'Путь к иконке',
            widget: 'input',
        },
        'omsmapbubble.opacity': {
            section: 'Иконка',
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },

        'omsmapbubble.algorithm': {
            section: 'Данные',
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
            section: 'Данные',
            title: 'Количество классов',
            widget: "number",
            default: 0,
            getProps: ([{ card, data }]) => ({
                max: data.rows.length
            }),
            min: 0
        },

        'omsmapbubble.size': {
            section: 'Иконка',
            title: 'Размер',
            widget: OMSNumberRange,
            default: [10, 50],
            max: 100,
            min: 1
        },
        "omsmapbubble.icon_border_color": {
            section: 'Обводка',
            title: 'Цвет обводки',
            widget: "color",
            default: '#509EE3',
        },
        "omsmapbubble.icon_border_size": {
            section: 'Обводка',
            title: 'Размер обводки',
            widget: "number",
            default: 0,
        },
        'omsmapbubble.show_label': {
            section: 'Подпись',
            title: 'Показывать подпись',
            widget: "toggle",
            default: false,
        },
        ...fieldSetting("omsmapbubble.label_column", {
            section: 'Подпись',
            title: 'Колонка',
            getDefault: ([{ data }]) => data.cols[0].name,
        }),
        'omsmapbubble.label_font_size': {
            section: 'Подпись',
            title: 'Размер шрифта',
            widget: 'number',
            default: 14,
        },
        'omsmapbubble.label_color': {
            section: 'Подпись',
            title: 'Цвет',
            widget: 'color',
            default: '#000000',
            getProps: () => ({
                fancy: true,
            })
        },
        ...OMSOlMap.getSettings('omsmapbubble')
    };

    componentDidMount() {
        super.componentDidMount();
        this.updateCategoryClasses();
        this.updateMarkers();
        this.updateLegend();
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);
        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        const mapParams = this.props.settings['omsmapbubble.mapParams'];
        const prevMapParams = prevProps.settings['omsmapbubble.mapParams'];

        if (!sameSeries) {
            this.updateCategoryClasses();
            this.updateMarkers();
            this.updateLegend();
        }
        if (JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) {
            this.updateMapState();
        }
        const mapUrl = this.props.settings['omsmapbubble.base_maps_list'].mapUrl;
        const prevMapUrl = prevProps.settings['omsmapbubble.base_maps_list'].mapUrl;
        if (mapUrl !== prevMapUrl) {
            this.setBaseMaps();
        }
       
        const baseMap = this.props.settings['omsmapbubble.default_base_map'];
        const prevBaseMap = prevProps.settings['omsmapbubble.default_base_map'];
        if (baseMap !== prevBaseMap) {
            this.setState({baseMapId: baseMap})
        }
    }

    getMapParams() {
        return this.props.settings['omsmapbubble.mapParams'].map(n => Number(n));
    }

    getObjectValue(featureData) {
        const { settings } = this.props;
        return featureData[settings['omsmapbubble.column']];
    }

    getObjectColumn(seriesIndex) {
        const { series, settings } = this.props;
        return series[seriesIndex].data.cols.find(c => c.name === settings['omsmapbubble.column']);
    }

    getMapUrl() {
        return this.props.settings['omsmapbubble.map_url']
    }

    getBaseMaps() {
        return this.props.settings['omsmapbubble.base_maps_list']
    }

    getDefaultBaseMap() {
        return this.props.settings['omsmapbubble.default_base_map']
    }

    updateLegend() {
        const { series, settings } = this.props;
        if (!settings['omsmapbubble.show_legend']) {
            this.setState({ legend: null });
            this.forceUpdate();
            return;
        }
        const columnName = settings['omsmapbubble.column'];
        const columnIndex = series[0].data.cols.findIndex(c => c.name === columnName);
        const column = series[0].data.cols[columnIndex];
        if (!isNumeric(column)) return;

        let max = 0;
        let min = 0;
        series[0].data.rows.forEach(r => {
            if (r[columnIndex] > max) max = r[columnIndex];
            if (r[columnIndex] < min) min = r[columnIndex];
        });
        const config = {
            type: 'bubble',
            min,
            max,
            color: settings['omsmapbubble.icon_color'] || '#000',
            icon: settings['omsmapbubble.icon_path'],
            borderColor: settings['omsmapbubble.icon_border_color'] || '#000'
        }
        this.setState({ legend: config });
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
    generateStyleForColor(color, opacity, radius, label, showLabel, labelSize, labelColor, borderColor, borderSize, icon_path) {
        const [r, g, b, a] = colorAsArray(color);
        const colorWithOpacity = [r, g, b, opacity / 100];
        const textStyle = showLabel 
        ? new Text({
            font: `${labelSize}px sans-serif`,
            text: label,
            fill:  new Fill({
                color: labelColor
            }),
            stroke: new Stroke({
                color: '#ffffff',
                width: 0.5
            }),
            offsetY: radius + labelSize / 2
        }) : null;

        const strokeStyle = (borderSize > 0) 
        ? new Stroke({
            color: borderColor,
            width: borderSize
        }) : null;

        const circeStyle = new Circle({
            fill: new Fill({
                color: colorWithOpacity
            }),
            stroke: strokeStyle,
            radius: radius
        });
        return new Promise((resolve, reject) => {
            if (icon_path) {
                const img = document.createElement('img');
                img.src = icon_path;
                const size = radius * 2;
                img.onload = () => {
                    const imgStyle = new Icon({
                        img,
                        anchor: [img.width / 2, img.height / 2],
                        anchorXUnits : 'pixels',
                        anchorYUnits : 'pixels',
                        imgSize: [img.width, img.height],
                        size: [img.width, img.height],
                        scale: size / img.width
                    })
                    resolve(new Style({
                        image: imgStyle,
                        text: textStyle
                    }))
                }
                img.onerror = () => {
                    resolve(new Style({
                        image: circeStyle,
                        text: textStyle
                    }))
                }
            } else {
                resolve(new Style({
                    image: circeStyle,
                    text: textStyle
                }))
            }
        })
    }

    updateMarkers() {
        const { settings, series, data } = this.props;
        const { rows, cols } = data;
        const geomColumnIndex = _.findIndex(cols, isGeomColumn);
        const idColumnIndex = _.findIndex(cols, isIdColumn);
        const labelIndex = _.findIndex(cols, (column) => column.name === settings['omsmapbubble.label_column']);
        this._vectorLayer.getSource().clear();
        const params = [
            settings['omsmapbubble.show_label'],
            settings['omsmapbubble.label_font_size'],
            settings['omsmapbubble.label_color'],
            settings['omsmapbubble.icon_border_color'],
            settings['omsmapbubble.icon_border_size'],
            settings['omsmapbubble.icon_path']
        ]

        if (geomColumnIndex === -1) {
            console.error('Ошибка получения колонки геометрии');
            return;
        }

        for (const row of rows) {
            const geoJSON = row[geomColumnIndex];
            const id = row[idColumnIndex];
            const rowValue = row[this.selectedColumnIndex];
            const label = String(row[labelIndex]);

            if (geoJSON === null || typeof rowValue !== 'number') {
                continue;
            }

            
            const features = this.geojsonToFeature(geoJSON);

            if (this.selectedColumnIndex !== -1) {
                for (const feature of features) {
                    const color = this.props.settings['omsmapbubble.icon_color'];
                    const opacity = this.props.settings['omsmapbubble.opacity'];
                    
                    const iconRadius = this.getIconSizeForValue(rowValue);
                    this.generateStyleForColor(color, opacity, iconRadius, label, ...params).then(style => {
                        feature.setStyle(style);
                        feature.set('id', id);
                    })
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

    renderLegend() {
        const { legend } = this.state;
        return <div className={styles.omsMapBubblesLegend}>
            <div>{legend.min}</div>
            {[10, 20, 30, 40, 50].map(d => {
                return <div 
                    className={styles.omsMapBubblesLegendItem}
                    key={d}
                    style={{
                        minWidth: d, 
                        maxWidth: d,
                        minHeight: d,
                        maxHeight: d, 
                        backgroundColor: legend.icon ? 'transparent' : legend.color,
                        border: legend.icon ? 'none' : `1px solid ${legend.borderColor}`
                    }}>
                        {legend.icon && <img 
                            src={legend.icon}
                            style={{width: '100%', height: '100%'}}
                        />}
                    </div>    
            })}
            <div>{legend.max}</div>
        </div>
    }
}

export const OMSMapBubble = OMSMapBubbleComponent;