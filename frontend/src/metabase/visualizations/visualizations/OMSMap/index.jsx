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
import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";

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
    };

    componentDidMount() {
        this._map = new Map({
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),
                this._pointVectorLayer
            ],
            target: this._mapMountEl,
            view: new View({
                center: [0, 0],
                zoom: 2,
            }),
        });

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

        if (!sameSeries) {
            this.updateMarkers();
        }

        if (!sameSize) {
            this._map.updateSize();
        }

        if (prevProps.settings !== this.props.settings) {
            this.regenerateStyles();
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

            for (const row of serie.data.rows) {
                const lat = row[latitudeColumnIndex];
                const lon = row[longitudeColumnIndex];

                const pointFeature = new Feature({
                    geometry: new PointGeom(fromLonLat([lon, lat], 'EPSG:3857'))
                });

                this._pointVectorLayer.getSource().addFeature(pointFeature);
            }
        }
    }

    render() {
        return (
            <div
                className={styles.omsMap}
                ref={el => this._mapMountEl = el}
            ></div>
        );
    }
}

export const OMSMap = OMSMapComponent;