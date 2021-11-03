/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from "underscore";

import { Fill, Stroke, Circle, Style } from 'ol/style';
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
import { OMSOlMap } from 'metabase/visualizations/components/OMSOlMap';
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
        super.componentDidMount();
        this.updateMarkers();
        this.regenerateStyles();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        super.componentDidUpdate(prevProps, prevState, snapshot);

        const sameSeries = isSameSeries(this.props.series, prevProps.series);

        const mapParams = this.props.settings['olmap.mapParams'];
        const prevMapParams = prevProps.settings['olmap.mapParams'];

        if (!sameSeries) {
            this.updateMarkers();
        }

        if (prevProps.settings !== this.props.settings) {
            this.regenerateStyles();
        }
        if (JSON.stringify(mapParams) !== JSON.stringify(prevMapParams)) {
            this.updateMapState();
        }
    }

    getMapParams() {
        return this.props.settings['olmap.mapParams'].map(n => Number(n));
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

    regenerateStyles() {
        this._vectorLayer.setStyle([
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
        this._vectorLayer.getSource().clear();

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

                this._vectorLayer.getSource().addFeature(pointFeature);
            }
        }
    }
}

export const OMSMap = OMSMapComponent;