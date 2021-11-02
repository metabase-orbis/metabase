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
class OMSPieMapComponent extends React.Component {
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

    static uiName = "OMS Круговые диаграммы";
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

        'omsmappie.opacity': {
            section: 'Иконки',
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },
        'omsmappie.outerRadius': {
            section: 'Иконки',
            title: 'Наружный радиус',
            widget: 'number',
            default: 50,
            min: 0
        },
        'omsmappie.innerRadius': {
            section: 'Иконки',
            title: 'Внутренний радиус',
            widget: 'number',
            default: 10,
            min: 0,
            getProps: ([{card}]) => ({
                max: card.visualization_settings['omsmappie.outerRadius'] - 5
            }),
        },
        'omsmappie.showNames': {
            section: 'Иконки',
            title: 'Отображать наименования',
            widget: "toggle",
            default: false,
        },
        'omsmappie.mapParams': {
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

    constructor(props) {
        super(props);
        this.onMapClick = this.onMapClick.bind(this);
    }

    componentDidMount() {
        const mapParams = this.props.settings['omsmappie.mapParams'].map(n => Number(n));
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
            }),
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
        this.updateMarkers();
    }

    componentDidUpdate(prevProps, prevState) {
        const sameSeries = isSameSeries(this.props.series, prevProps.series);
        const sameSize =
            this.props.width === prevProps.width &&
            this.props.height === prevProps.height;

        if (!sameSeries) {
            this.updateMarkers();
        }

        const mapParams = this.props.settings['omsmappie.mapParams'];
        const prevMapParams = prevProps.settings['omsmappie.mapParams'];

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
        })).filter((d) => d.col.name !== 'orbis_id' && d.col.name !== 'geom');
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
        let outerR = settings['omsmappie.outerRadius'];
        let innerR = settings['omsmappie.innerRadius'];
        if (outerR < innerR) {
            outerR = settings['omsmappie.innerRadius'];
            innerR = settings['omsmappie.outerRadius'];
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
            tspan.innerText = settings['omsmappie.showNames'] ? v.data.displayValue : v.data.value;
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
        const { data, settings } = this.props;
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
    }

    updateMapState() {
        const mapParams = this.props.settings['omsmappie.mapParams'];
        const projection = this._map.getView().getProjection().getCode();
        const center = transform([mapParams[1], mapParams[2]], 'EPSG:4326', projection);
        this._map.getView().setZoom(mapParams[0]);
        this._map.getView().setCenter(center);
    }

    render() {
        const {onHoverChange} = this.props;
        return (
            <div
                className={css.omsMap}
                ref={el => this._mapMountEl = el}
                onMouseLeave={() => onHoverChange && onHoverChange(null)}
            ></div>
        );
    }
}

export const OMSPieMap = OMSPieMapComponent;
