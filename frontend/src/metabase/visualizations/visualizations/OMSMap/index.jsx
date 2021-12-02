/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from "underscore";

import { Fill, Stroke, Circle, Style, Text, Icon } from 'ol/style';
import Feature from 'ol/Feature';
import PointGeom from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';

import {
    isNumeric,
    isLatitude,
    isLongitude
} from "metabase/lib/schema_metadata";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { isIdColumn } from 'metabase/visualizations/lib/oms/column-filters';
import { isSameSeries } from "metabase/visualizations/lib/utils";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { OMSInputGroup } from 'metabase/visualizations/components/settings/OMSInputGroup';
import { OMSOlMap, defaultMapPositionConfig } from 'metabase/visualizations/components/OMSOlMap';
import styles from './style.css';

import type { VisualizationProps } from "metabase-types/types/Visualization";
import type { SettingDef } from 'metabase/visualizations/lib/settings';

export interface IOMSMapProps extends VisualizationProps { }
export interface IOMSMapState { }

class OMSMapComponent extends OMSOlMap<IOMSMapProps, IOMSMapState> {
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
        'olmap.icon_path': {
            section: 'Иконка',
            title: 'Путь к иконке',
            widget: 'input',
        },
        'olmap.show_label': {
            section: 'Подпись',
            title: 'Показывать подпись',
            widget: "toggle",
            default: false,
        },
        ...fieldSetting("olmap.label_column", {
            section: 'Подпись',
            title: 'Колонка',
            getDefault: ([{ data }]) => data.cols[0].name,
        }),
        'olmap.label_font_size': {
            section: 'Подпись',
            title: 'Размер шрифта',
            widget: 'number',
            default: 14,
        },
        'olmap.label_color': {
            section: 'Подпись',
            title: 'Цвет',
            widget: 'color',
            default: '#000000',
            getProps: () => ({
                fancy: true,
            })
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
        ...OMSOlMap.getSettings('olmap')
    }

    componentDidMount() {
        super.componentDidMount();
        this.updateMarkers();
        this.regenerateStyles();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        super.componentDidUpdate(prevProps, prevState, snapshot);
        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        if (!sameSeries) {
            this.updateMarkers();
        }

        if (prevProps.settings !== this.props.settings) {
            this.regenerateStyles();
        }

        const mapParams = this.props.settings['olmap.mapParams'];
        const prevMapParams = prevProps.settings['olmap.mapParams'];

        const mapZoomRange = this.props.settings['olmap.zoom_range'];
        const prevMapZoomRange = prevProps.settings['olmap.zoom_range'];
        if ((JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) || 
            (JSON.stringify(mapZoomRange) !== JSON.stringify(prevMapZoomRange))) {
            this.updateMapState();
        }

        const mapUrl = this.props.settings['olmap.base_maps_list'].mapUrl;
        const prevMapUrl = prevProps.settings['olmap.base_maps_list'].mapUrl;
        if (mapUrl !== prevMapUrl) {
            this.setBaseMaps();
        }
       
        const baseMap = this.props.settings['olmap.default_base_map'];
        const prevBaseMap = prevProps.settings['olmap.default_base_map'];
        if (baseMap !== prevBaseMap) {
            this.setState({baseMapId: baseMap})
        }
    }

    getMapParams() {
        return this.props.settings['olmap.mapParams'].map(n => Number(n));
    }

    getZoomRange() {
        const { min_zoom, max_zoom } = defaultMapPositionConfig;
        const zoomRange = this.props.settings['olmap.zoom_range'] || [min_zoom, max_zoom]
        return zoomRange.map(n => Number(n));
    }

    getObjectValue(featureData) {
        return featureData['orbis_id'] || featureData['id'];
    }

    getObjectColumn(seriesIndex) {
        const { series, settings } = this.props;
        let column;
        let possibleKeys = ['orbis_id', 'id', settings['olmap.latitude_column'], settings['olmap.longitude_column']];
        let index = 0;
        while (!column || index === possibleKeys.length) {
            column = series[seriesIndex].data.cols.find(c => c.name === possibleKeys[index]);
            index++;
        }
        return column;
    }

    getMapUrl() {
        return this.props.settings['olmap.map_url']
    }

    getBaseMaps() {
        return this.props.settings['olmap.base_maps_list']
    }

    getDefaultBaseMap() {
        return this.props.settings['olmap.default_base_map']
    }

    regenerateStyles() {
        const { settings } = this.props;
        this._vectorLayer.getSource().getFeatures().forEach(f => {
            const textStyle = settings['olmap.show_label']
            ? new Text({
                font: `${settings['olmap.label_font_size']}px sans-serif`,
                text: f.get('label'),
                fill:  new Fill({
                    color: settings['olmap.label_color']
                }),
                stroke: new Stroke({
                    color: '#ffffff',
                    width: 0.5
                }),
            }) : null;

            const circleStyle = new Circle({
                fill: new Fill({
                    color: settings['olmap.icon_color']
                }),
                stroke: new Stroke({
                    color: settings['olmap.icon_border_color'],
                    width: settings['olmap.icon_border_size']
                }),
                radius: settings['olmap.icon_size']
            })
            if (settings['olmap.icon_path']) {
                const img = document.createElement('img');
                img.src = settings['olmap.icon_path'];
                img.onload = () => {
                    const imgStyle = new Icon({
                        img,
                        anchor: [img.width / 2, img.height / 2],
                        anchorXUnits : 'pixels',
                        anchorYUnits : 'pixels',
                        imgSize: [img.width, img.height],
                        size: [img.width, img.height],
                        scale: settings['olmap.icon_size'] * 2 / img.width
                    })
                    f.setStyle([
                        new Style({
                            image: imgStyle,
                            text: textStyle
                        })
                    ])
                }
                img.onerror = () => {
                    f.setStyle([
                        new Style({
                            image: circleStyle,
                            text: textStyle
                        })
                    ])
                }
                
            } else {
                f.setStyle([
                    new Style({
                        image: circleStyle,
                        text: textStyle
                    })
                ])
            }
        })
    }

    updateMarkers() {
        const { settings, series } = this.props;
        this._vectorLayer.getSource().clear();

        const latitudeColumnName = settings['olmap.latitude_column'];
        const longitudeColumnName = settings['olmap.longitude_column'];
        const labelColumn = settings['olmap.label_column'];

        for (const serie of series) {
            const latitudeColumnIndex = _.findIndex(serie.data.cols, (column) => column.name === latitudeColumnName);
            const longitudeColumnIndex = _.findIndex(serie.data.cols, (column) => column.name === longitudeColumnName);
            const idIndex = _.findIndex(serie.data.cols, isIdColumn);
            const labelIndex = _.findIndex(serie.data.cols, (column) => column.name === labelColumn)

            for (const row of serie.data.rows) {
                const lat = row[latitudeColumnIndex];
                const lon = row[longitudeColumnIndex];
                const id = row[idIndex];
                const label = row[labelIndex];

                const pointFeature = new Feature({
                    geometry: new PointGeom(fromLonLat([lon, lat], 'EPSG:3857'))
                });
                pointFeature.set('id', id);
                pointFeature.set('label', String(label))
                this._vectorLayer.getSource().addFeature(pointFeature);
            }
        }
    }
}

export const OMSMap = OMSMapComponent;