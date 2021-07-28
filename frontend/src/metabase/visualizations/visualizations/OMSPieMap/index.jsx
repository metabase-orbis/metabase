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

import css from './style.css';

import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { isNumeric } from "metabase/lib/schema_metadata";
import { OMSMapPieFields } from 'metabase/visualizations/components/settings/OMSMapPieFields';



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
                        color: '#00ffff'
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