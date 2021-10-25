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
import GeometryType from 'ol/geom/GeometryType';
import { asArray as colorAsArray } from 'ol/color';
import { Fill, Stroke, Circle, Style } from 'ol/style';
import { transform } from 'ol/proj';

import css from './style.css';

import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { isNumeric } from "metabase/lib/schema_metadata";
import { OMSMapPieFields } from 'metabase/visualizations/components/settings/OMSMapPieFields';
import { generateColor } from 'metabase/visualizations/lib/oms/colors';
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';



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
            title: 'Непрозрачность',
            widget: "number",
            default: 80,
            min: 0,
            max: 100
        },
        'omsmappie.mapParams': {
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
        // this.updateCategoryClasses();
        // this.updateMarkers();
    }

    componentDidUpdate(prevProps, prevState) {
        const sameSeries = isSameSeries(this.props.series, prevProps.series);
        const sameSize =
            this.props.width === prevProps.width &&
            this.props.height === prevProps.height;

        // if (!sameSeries) {
        //     this.updateCategoryClasses();
        //     this.updateMarkers();
        // }

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

    updateMapState() {
        const mapParams = this.props.settings['omsmappie.mapParams'];
        const projection = this._map.getView().getProjection().getCode();
        const center = transform([mapParams[1], mapParams[2]], 'EPSG:4326', projection);
        this._map.getView().setZoom(mapParams[0]);
        this._map.getView().setCenter(center);
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

export const OMSPieMap = OMSPieMapComponent;