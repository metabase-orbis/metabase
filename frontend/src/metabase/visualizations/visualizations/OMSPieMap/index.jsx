/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
import OLMap from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import PointGeom from 'ol/geom/Point';
import GeoJSONFormatter from 'ol/format/GeoJSON';
import Projection from 'ol/proj/Projection';
import GeometryType from 'ol/geom/GeometryType';
import { fromLonLat } from 'ol/proj';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style, Icon as IconStyle } from 'ol/style';
import WKB from 'ol/format/WKB';
import { transform } from 'ol/proj';
/* eslint-disable-next-line */
import centerOfMass from '@turf/center-of-mass';
import d3 from "d3";

import css from './style.css';

import { memoize } from 'metabase-lib/lib/utils'
import { isSameSeries, getOlFeatureInfoFromSeries, getOlFeatureOnPixel } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { isNumeric } from "metabase/lib/schema_metadata";
import { OMSMapPieFields } from 'metabase/visualizations/components/settings/OMSMapPieFields';
import { generateColor } from 'metabase/visualizations/lib/oms/colors';
import { isGeomColumn, isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import { OMSOlMap, defaultMapPositionConfig } from 'metabase/visualizations/components/OMSOlMap';
import Icon from "metabase/components/Icon";

/**
 * @typedef IOMSMapProps
 */

/**
 * @typedef IOMSMapState
 */

/**
 * @extends {React.Component<import('metabase-types/types/Visualization').VisualizationProps & IOMSMapProps, IOMSMapState>}
 */
class OMSPieMapComponent extends OMSOlMap {

    static uiName = "ORBISmap Круговые диаграммы";
    static identifier = "omsmappie";
    static iconName = "location";

    /**
     * @type {number}
     * Индекс выбранной колонки. Используется для получения значения колонки из строки таблицы
     */
    selectedColumnIndex;

    /**
     * @type {{ [k: string]: import('metabase/visualizations/lib/settings').SettingDef; }}
     */
    static settings = {
        "omsmappie.fields": {
            section: 'Колонки',
            title: 'Колонки',
            widget: OMSMapPieFields,
            getProps: ([{ data }]) => {
                return {
                    cols: data.cols.filter(isNumeric)
                }
            },
            getDefault: ([{ data }]) => {
                const [firstNumericCol] = data.cols.filter(isNumeric);
                const firstNumericColName = firstNumericCol ? firstNumericCol.name : 'orbis_id';
                return [
                    {
                        name: firstNumericColName,
                        color: generateColor()
                    }
                ]
            }
        },
        'omsmappie.show_legend': {
            section: 'Колонки',
            title: 'Легенда',
            widget: "toggle",
            default: false,
        },

        'omsmappie.opacity': {
            section: 'Иконки',
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },
        'omsmappie.outer_radius': {
            section: 'Иконки',
            title: 'Наружный радиус',
            widget: 'number',
            default: 50,
            min: 0
        },
        'omsmappie.inner_radius': {
            section: 'Иконки',
            title: 'Внутренний радиус',
            widget: 'number',
            default: 10,
            min: 0,
            getProps: ([{card}]) => ({
                max: card.visualization_settings['omsmappie.outer_radius'] - 5
            }),
        },
        'omsmappie.show_names': {
            section: 'Иконки',
            title: 'Отображать наименования',
            widget: "toggle",
            default: false,
        },
        ...OMSOlMap.getSettings('omsmappie')
    };

    static isSensible({ cols, rows }) {
        return true;
    }

    constructor(props) {
        super(props);
    }

    componentDidMount() {
        super.componentDidMount();
        this.updateMarkers();
        this.updateLegend();
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);
        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        if (!sameSeries) {
            this.updateMarkers();
            this.updateLegend();
        }
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

    @memoize
    generateStyle(row) {
        const { data, settings } = this.props;
        let outerR = settings['omsmappie.outer_radius'];
        let innerR = settings['omsmappie.inner_radius'];
        if (outerR < innerR) {
            outerR = settings['omsmappie.inner_radius'];
            innerR = settings['omsmappie.outer_radius'];
        }
        const increase = 50;
        const { cols } = data;
        const dataValues = {};
        cols.forEach((c, i) => { dataValues[c.name] = {value: row[i], name: c.display_name} });
        const values = [];
        settings['omsmappie.fields'].forEach((s, i) => {
            values.push({
                displayValue: dataValues[s.name].name,
                value: dataValues[s.name].value,
                color: s.color,
                rowIndex: i
            });
        });
        const pie = d3.layout
            .pie()
            .sort(null)
            .padAngle((Math.PI / 180) * 1)
            .value(d => d.value);
        const arc = d3.svg
            .arc()
            .outerRadius(outerR)
            .innerRadius(innerR);
        const svg = document.createElement('svg');
        svg.setAttribute('viewBox', `0 0 ${outerR * 2 + increase} ${outerR * 2 + increase}`);
        svg.setAttribute('width', outerR * 2 + increase);
        svg.setAttribute('height', outerR * 2 + increase);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('border', '1px solid red');
        const g = document.createElement('g');
        g.setAttribute('transform', `translate(${outerR + increase / 2}, ${outerR + increase / 2})`);
        g.setAttribute('stroke', '#ffffff');
        g.setAttribute('stroke-width', 1);
        g.setAttribute('stroke-linejoin', 'round');
        const textG = document.createElement('g');
        textG.setAttribute('transform', `translate(${outerR + increase / 2}, ${outerR + increase / 2})`);
        textG.setAttribute('font-family', 'sans-serif');
        textG.setAttribute('font-size', 10);
        textG.setAttribute('text-anchor', 'middle');
        pie(values).forEach((v, i) => {
            const path = document.createElement('path');
            path.setAttribute('d', arc(v));
            path.setAttribute('fill', values[i].color);
            g.appendChild(path);
            
            const text = document.createElement('text');
            text.setAttribute('transform', `translate(${arc.centroid(v)})`);
            const tspan = document.createElement('tspan');
            tspan.innerText = settings['omsmappie.show_names'] ? v.data.displayValue : v.data.value;
            tspan.setAttribute('width', '10px');
            tspan.setAttribute('word-wrap', 'break-word');
            text.appendChild(tspan);
            textG.appendChild(text);
        });
        svg.appendChild(g);
        svg.appendChild(textG);

        let image = new Image();
        let div = document.createElement('div');
        div.appendChild(svg);
        var b64 = `data:image/svg+xml;base64,${window.btoa(div.innerHTML)}`;
        image.src = b64;
        return new Style({
            image: new IconStyle({
                img: image,
                imgSize: [outerR * 2 + increase, outerR * 2 + increase],
                opacity: settings['omsmappie.opacity'] / 100
            })
        })
    }

    updateMarkers() {
        const { data, settings, isDashboard } = this.props;
        const { rows, cols } = data;
        this._vectorLayer.getSource().clear();
        const geomColumnIndex = _.findIndex(cols, isGeomColumn);
        const idColumnIndex = _.findIndex(cols, isIdColumn);

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
            for (const feature of features) {
                feature.set('id', id);
                feature.setStyle(this.generateStyle(row));
            }

            this._vectorLayer.getSource().addFeatures(features);
        }
        if (isDashboard) {
            this.fitToExtent()
        }
    }

    updateLegend() {
        const { series, settings } = this.props;
        if (!settings['omsmappie.show_legend']) {
            this.setState({ legend: null });
            return;
        }
        const lRows = settings['omsmappie.fields'].map((r) => {
            const col = series[0].data.cols.find(c => c.name === r.name);
            return {
                name: col ? col.display_name : r.name,
                color: r.color
            }
        })
        const config = {
            type: 'pie',
            lRows
        }
        this.setState({ legend: config })
    }

    renderLegend() {
        const { legend } = this.state;
        return <div className={css.omsMapPieLegend}>
            {legend.lRows.map((r) => (<div className={css.omsMapPieLegendItem} key={r.name}>
                <div className={css.omsMapPieLegendColor} style={{ backgroundColor: r.color }} />
                <div className={css.omsMapPieLegendTitle}>{r.name}</div>
            </div>))}
        </div>
    }
}

export const OMSPieMap = OMSPieMapComponent;
