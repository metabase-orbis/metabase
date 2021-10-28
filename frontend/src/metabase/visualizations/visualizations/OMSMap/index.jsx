/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from "underscore";

import Map from 'ol/Map';
import OSM from 'ol/source/OSM';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Circle, Style } from 'ol/style';
import Feature from 'ol/Feature';
import PointGeom from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import View from 'ol/View';
import { transform } from 'ol/proj';

import {
    isNumeric,
    isLatitude,
    isLongitude,
    isMetric,
    hasLatitudeAndLongitudeColumns,
    isState,
    isCountry,
} from "metabase/lib/schema_metadata";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { isSameSeries, getOlFeatureInfoFromSeries, getOlFeatureOnPixel } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import styles from './style.css';

import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { SettingDef } from 'metabase/visualizations/lib/settings';

export interface IOMSMapProps extends VisualizationProps { }
export interface IOMSMapState { }

class OMSMapComponent extends React.Component<IOMSMapProps, IOMSMapState> {

    _map: Map;
    _pointVectorLayer = new VectorLayer({
        source: new VectorSource()
    });
    _mapMountEl: HTMLDivElement;

    static uiName = "Openlayers Map";
    static identifier = "olmap";
    static iconName = "location";

    static isSensible({ cols, rows }) {
        return true;
    }

    constructor(props: IOMSMapProps) {
        super(props);
        this.onMapClick = this.onMapClick.bind(this);
    }

    static settings: { [k: string]: SettingDef; } = {
        ...fieldSetting("olmap.latitude_column", {
            section: 'Колонки',
            title: `Долгота`,
            fieldFilter: isNumeric,
            getDefault: ([{ data }]) => (_.find(data.cols, isLatitude) || {}).name,
        }),

        ...fieldSetting("olmap.longitude_column", {
            section: 'Колонки',
            title: `Широта`,
            fieldFilter: isNumeric,
            getDefault: ([{ data }]) => (_.find(data.cols, isLongitude) || {}).name,
        }),

        "olmap.icon_color": {
            section: 'Иконка',
            title: 'Цвет иконки',
            widget: "color"
        },
        "olmap.icon_size": {
            section: 'Иконка',
            title: 'Размер иконки',
            widget: "number",
            default: 12,
        },

        "olmap.icon_border_color": {
            section: 'Обводка',
            title: 'Цвет обводки',
            widget: "color"
        },
        "olmap.icon_border_size": {
            section: 'Обводка',
            title: 'Размер обводки',
            widget: "number",
            default: 0,
        },
        'olmap.mapParams': {
            section: 'Карта',
            title: 'Параметры карты',
            widget: OMSInputGroup,
            names: ['Масштаб', 'Координаты центра'],
            default: [2, 0, 0],
            types: ['number', 'number', 'number'],
            setValueTitle: 'Текущая позиция карты'
        }
    };

    componentDidMount() {
        const mapParams = this.props.settings['olmap.mapParams'].map(n => Number(n));
        const [zoom, ...center] = mapParams;
        const trCenter = transform(center, 'EPSG:4326', 'EPSG:3857');
        this._map = new Map({
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),
                this._pointVectorLayer
            ],
            target: this._mapMountEl,
            view: new View({
                center: trCenter,
                zoom: zoom || 2,
            })
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
        this.regenerateStyles();
    }

    shouldComponentUpdate(nextProps, nextState) {
        const sameSize =
            this.props.width === nextProps.width &&
            this.props.height === nextProps.height;
        const sameSeries = isSameSeries(this.props.series, nextProps.series);
        return !sameSize || !sameSeries;
    }

    componentDidUpdate(prevProps, prevState) {
        const sameSize =
            this.props.width === prevProps.width &&
            this.props.height === prevProps.height;

        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        const mapParams = this.props.settings['olmap.mapParams'];
        const prevMapParams = prevProps.settings['olmap.mapParams'];

        if (!sameSeries) {
            this.updateMarkers();
        }

        if (!sameSize) {
            this._map.updateSize();
        }

        if (prevProps.settings !== this.props.settings) {
            this.regenerateStyles();
        }
        if (JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) {
            this.updateMapState();
        }
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
        let value = featureData['orbis_id'] || featureData['id'];
        const seriesIndex = 0;
        const seriesData = series[seriesIndex].data || {};
        const cols = seriesData.cols;
        data = cols.map((c) => ({
            key: c.display_name || c.name,
            value: featureData[c.name],
            col: c
        }));
        dimensions = cols.map((c) => ({
            column: c,
            value: featureData[c.name]
        }));
        let column;
        let possibleKeys = ['orbis_id', 'id', settings['olmap.latitude_column'], settings['olmap.longitude_column']];
        let index = 0;
        while (!column || index === possibleKeys.length) {
            column = series[seriesIndex].data.cols.find(c => c.name === possibleKeys[index]);
            index++;
        }
        
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

    regenerateStyles() {
        this._pointVectorLayer.setStyle([
            new Style({
                image: new Circle({
                    fill: new Fill({
                        color: this.props.settings['olmap.icon_color']
                    }),
                    stroke: new Stroke({
                        color: this.props.settings['olmap.icon_border_color'],
                        width: this.props.settings['olmap.icon_border_size']
                    }),
                    radius: this.props.settings['olmap.icon_size']
                })
            })
        ]);
    }

    updateMarkers() {
        const { settings, series } = this.props;
        this._pointVectorLayer.getSource().clear();

        const latitudeColumnName = settings['olmap.latitude_column'];
        const longitudeColumnName = settings['olmap.longitude_column'];

        for (const serie of series) {
            const latitudeColumnIndex = _.findIndex(serie.data.cols, (column) => column.name === latitudeColumnName);
            const longitudeColumnIndex = _.findIndex(serie.data.cols, (column) => column.name === longitudeColumnName);
            const idIndex = _.findIndex(serie.data.cols, isIdColumn)

            for (const row of serie.data.rows) {
                const lat = row[latitudeColumnIndex];
                const lon = row[longitudeColumnIndex];
                const id = row[idIndex];

                const pointFeature = new Feature({
                    geometry: new PointGeom(fromLonLat([lon, lat], 'EPSG:3857'))
                });
                pointFeature.set('id', id);

                this._pointVectorLayer.getSource().addFeature(pointFeature);
            }
        }
    }

    updateMapState() {
        const mapParams = this.props.settings['olmap.mapParams'];
        const projection = this._map.getView().getProjection().getCode();
        const center = transform([mapParams[1], mapParams[2]], 'EPSG:4326', projection);
        this._map.getView().setZoom(mapParams[0]);
        this._map.getView().setCenter(center);
    }

    render() {
        const { onHoverChange } = this.props;
        return (
            <div
                className={styles.omsMap}
                ref={el => this._mapMountEl = el}
                onMouseLeave={() => onHoverChange && onHoverChange(null)}
            ></div>
        );
    }
}

export const OMSMap = OMSMapComponent;