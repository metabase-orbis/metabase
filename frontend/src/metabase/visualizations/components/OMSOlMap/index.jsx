/* eslint-disable react/prop-types */
import * as React from 'react';
import { isMobile } from 'react-device-detect';
import OLMap from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import { OSM, XYZ, TileWMS, TileArcGISRest } from 'ol/source';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { transform, toLonLat } from 'ol/proj';
import cx from 'classnames';
import { isSameSeries, getOlFeatureInfoFromSeries, getOlFeatureOnPixel } from "metabase/visualizations/lib/utils";
import { getConfigFromOMSMap } from 'metabase/services';
import Select, { Option } from "metabase/components/Select";
import Icon from "metabase/components/Icon";

import css from './style.css';

const defaultSources = {
    0: new OSM()
}

const defaultBaseMapsConfig =  [{container_id: 0,
    copyright: null,
    id: 1000,
    localized_name: false,
    name: "OpenStreetMap",
    names: [{ru: "OpenStreetMap"}],
    selected: false,
    sort: 0,
    type: "PUBLIC_SERVICE",
    value: "OSM",
    vector: false
}];


const sourceAliases = {
    'yandexMap'    : 'yandex#map',
    'yandexSat'    : 'yandex#satellite',
    'yandexHybrid' : 'yandex#hybrid',
    'yandexPublic' : 'yandex#publicMap',
    'googleRoadmap': 'ROADMAP',
    'googleSat'    : 'SATELLITE',
    'googleHybrid' : 'HYBRID',
    'googleTerrain': 'TERRAIN'
};

class OMSOlMapComponent extends React.Component {
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

    sources = defaultSources;
    _baseLayer = new TileLayer();
    _setBaseMapsTimeout;
    _yaMap;
    _yaContainer = React.createRef();
    _googleMapsApiKey = '';
    _gooMap;
    _gooContainer = React.createRef();

    constructor(props) {
        super(props);
        this.state = {
            baseMaps: [],
            baseMapId: 0,
            legend: null,
            minLegend: false
        }
        this.onMapClick = this.onMapClick.bind(this);
        this.yaSyncCenter = this.yaSyncCenter.bind(this);
        this.yaSyncSize = this.yaSyncSize.bind(this);
        this.gooSyncCenter = this.gooSyncCenter.bind(this);
        this.gooSyncSize = this.gooSyncSize.bind(this);
        this.gooSyncZoom = this.gooSyncZoom.bind(this);
    }

    componentDidMount() {
        const mapParams = this.getMapParams().map(n => Number(n));
        const [zoom, ...center] = mapParams;
        const trCenter = transform(center, 'EPSG:4326', 'EPSG:3857');
        this._map = new OLMap({
            layers: [
                this._baseLayer,
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
        });
        this.setInteractions();
        this.setBaseMaps();
    }

    componentDidUpdate(prevProps, prevState) {
        const sameSize =
            this.props.width === prevProps.width &&
            this.props.height === prevProps.height;
        if (!sameSize) {
            this._map.updateSize();
        }
        if (this.state.baseMapId !== prevState.baseMapId) {
            this.switchBaseMap();
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        const sameSize =
            this.props.width === nextProps.width &&
            this.props.height === nextProps.height;
        const sameSeries = isSameSeries(this.props.series, nextProps.series);
        const sameBaseMap = this.state.baseMapId === nextState.baseMapId;
        const sameLegend = this.state.legend === nextState.legend;
        const sameLegendMin = this.state.minLegend === nextState.minLegend;
        return !sameSize || !sameSeries || !sameBaseMap || !sameLegend || !sameLegendMin;
    }

    getMapParams() {
        return [2, 0, 0]
    }

    getObjectValue(featureData) {
        return featureData['orbis_id'] || featureData['id'];
    }

    getObjectColumn(seriesIndex) {
        const { series } = this.props;
        let column;
        let possibleKeys = ['orbis_id', 'id'];
        let index = 0;
        while (!column || index === possibleKeys.length) {
            column = series[seriesIndex].data.cols.find(c => c.name === possibleKeys[index]);
            index++;
        }
        return column;
    }

    getObjectConfig(featureData, e, isBalloon) {
        const { series, settings } = this.props;
        if (!featureData) return null;
        let data = [];
        let dimensions = [];
        let value = this.getObjectValue(featureData);
        const seriesIndex = 0;
        const seriesData = series[seriesIndex].data || {};
        const cols = seriesData.cols;
        data = cols.map((c) => ({
            key: c.display_name || c.name,
            value: featureData[c.name],
            col: c
        })).filter(c => 
            c.col.name !== 'orbis_id' && 
            c.col.name !== 'geom')
        if (isBalloon) {
            data = data.filter(c => typeof c.value === 'number' ? true : c.value);
        }
        dimensions = cols.map((c) => ({
            column: c,
            value: featureData[c.name]
        }));
        let column = this.getObjectColumn(seriesIndex);
        
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

    getMapUrl() {
        return '';
    }

    setBaseMaps() {
        clearTimeout(this._setBaseMapsTimeout);
        this._setBaseMapsTimeout = setTimeout(async () => {
            const mapUrl = this.getMapUrl();
            if (!mapUrl) {
                this.setBaseSources(defaultBaseMapsConfig);
                this.setState({
                    baseMapId: defaultBaseMapsConfig[0].id,
                    baseMaps: defaultBaseMapsConfig
                });
                return;
            }
            const a = document.createElement('a');
            a.href = mapUrl;
            let url = `${a.protocol}//${a.host}${a.pathname}`;
            let config = null;
            try {
                config = await getConfigFromOMSMap(url);
                this._googleMapsApiKey = config.google_maps_api_key;
                config = config.publication.base_maps;
            } catch(e) {
                console.warn(e);
                config = defaultBaseMapsConfig;
            }
            this.setBaseSources(config);
            const selected = config.find(bm => bm.selected);
            this.setState({
                baseMapId: selected ? selected.id : config[0].id,
                baseMaps: config.filter(bm => bm.value !== 'cadastre')
            });
        }, 500)
    }

    switchBaseMap() {
        const { baseMapId, baseMaps } = this.state;
        const baseMap = baseMaps.find(bm => bm.id === baseMapId);
        this.hideYaMap();
        this.hideGooMap();
        this._baseLayer.setVisible(false);
        if (['yandexMap', 'yandexSat', 'yandexHybrid'].includes(baseMap.value)) {
            if (!this._yaMap) {
                this.initYaMap().then(() => this.showYaMap(baseMap.value));
            } else {
                this.showYaMap(baseMap.value);
            }
            return;
        } else if (['googleRoadmap', 'googleSat', 'googleHybrid', 'googleTerrain'].includes(baseMap.value)) {
            if (!this._gooMap) {
                this.initGooMap(sourceAliases[baseMap.value]).then(() => this.showGooMap(baseMap.value));
            } else {
                this.showGooMap(baseMap.value)
            }
            return;
        }
        this._baseLayer.setVisible(true);
        this._baseLayer.setSource(this.sources[baseMapId]);
    }

    setBaseSources(baseMaps) {
        this.sources = {};
        baseMaps.forEach(bm => {
            if (bm.type === 'PUBLIC_SERVICE') {
                if (bm.value === 'OSM') {
                    this.sources[bm.id] = new OSM();
                } else if (bm.value === 'ORBISMapBaseMap') {
                    let xyzUrl = "https://maps.orbismap.ru/base.png?x={x}&y={-y}&z={z}";
                    let tilePixelRatio = 1;
                    if (window.devicePixelRatio > 1) {
                        tilePixelRatio = Math.round(window.devicePixelRatio);
                        xyzUrl += '&retina=' + tilePixelRatio;
                    }
                    this.sources[bm.id] = new XYZ({
                        crossOrigin: "anonymous",
                        url        : xyzUrl,
                        tilePixelRatio: tilePixelRatio
                    });
                }
            } else if (bm.type === 'XYZ') {
                let rPixelRatio = /\{pixelratio([&?][^=]*)?=([^}]+)\}/;
                let res = bm.value.match(rPixelRatio);
                let replacer = '';
                let xValues;
                let xVar = '';
                let xVal;
                let xyzUrl = bm.value;
                let tilePixelRatio = 1;
                if (window.devicePixelRatio > 1) {
                    tilePixelRatio = Math.round(window.devicePixelRatio);
                }
                if (res) {
                    if (res.length === 3) {
                        if (res[1]) {
                            xVar += res[1] + '=';
                        }
                        xValues = res[2].split(',');
                    } else {
                        xValues = res[1].split(',');
                    }

                    if (this._pixelRatio === 1) {
                        xVal = xValues[tilePixelRatio-1];
                    } else {
                        for ( var n = tilePixelRatio -1; n > 0; n--) {
                            xVal = xValues[n];
                            if (xVal && xVal.trim() !== '') {
                                tilePixelRatio = n + 1;
                                break;
                            }
                        }
                    }

                    if (xVal && xVal.trim() !== "") {
                        replacer = xVar + xVal;
                    }
                    xyzUrl = xyzUrl.replace(res[0], replacer);
                }
                this.sources[bm.id] = new XYZ({
                    crossOrigin: "anonymous",
                    url        : xyzUrl,
                    tilePixelRatio: tilePixelRatio
                });
            } else if (bm.type === 'WMS') {
                let wmsJson = JSON.parse(bm.value);
                let url         = wmsJson['url'];
                delete wmsJson['url'];

                this.sources[bm.id] = new TileWMS({
                    crossOrigin: "anonymous",
                    url        : url,
                    params     : wmsJson
                });
            } else if (bm.type == 'ARCGIS') {
                let arcGisJson = JSON.parse(bm.value);
                let url            = arcGisJson['url'];
                delete arcGisJson['url'];

                this.sources[bm.id] = new TileArcGISRest({
                    crossOrigin: "anonymous",
                    url        : url,
                    params     : arcGisJson
                });
            }
            
        });
    }

    initYaMap() {
        const initPropmise = new Promise((resolve, reject) => {
            if (window.ymaps === undefined) {
                let ymapsApi = document.createElement('script');
                ymapsApi.src = '//api-maps.yandex.ru/2.1/?lang=ru_RU';
                document.getElementsByTagName('head')[0].appendChild(ymapsApi);
                ymapsApi.onload = function () {
                    ymapsApi.onload = void(0);
                    window.ymaps.ready(function () {
                        resolve();
                    })
                }
                ymapsApi.onerror = function () {
                    ymapsApi.onerror = void(0);
                    reject();
                }
            } else {
                resolve();
            }
        });
        return initPropmise.then(() => {
            if (this._yaMap) return;
            let view = this._map.getView();
            let center = view.getCenter();
            center = transform(center, view.getProjection().getCode(), 'EPSG:4326');
            this._yaMap = new window.ymaps.Map(this._yaContainer.current, {
                center: [center[1], center[0]],
                zoom: view.getZoom(),
                controls: []
            }, {
                suppressMapOpenBlock: true,
                avoidFractionalZoom: false
            });
        })
    }

    showYaMap(layerName) {
        let view      = this._map.getView();
        let center    = view.getCenter();
        let layerType = layerName in sourceAliases ? sourceAliases[layerName] : 'yandex#map';
        center        = transform(center, 'EPSG:3857', 'EPSG:4326');

        this._yaContainer.current.style.display = "block";

        this._map.un('precompose', this.yaSyncCenter);
        this._map.un('change:size', this.yaSyncSize);

        this._yaMap.container.fitToViewport();
        this._yaMap.setType(layerType);
        this._yaMap.setCenter([center[1], center[0]], view.getZoom());
      
        this._mapMountEl
            .querySelector('[class*=copyrights-pane]')
            .style.display = 'block';

        this._map.on('precompose', this.yaSyncCenter);
        this._map.on('change:size', this.yaSyncSize);
    }

    hideYaMap() {
        this._map.un('precompose', this.yaSyncCenter);
        this._map.un('change:size', this.yaSyncSize);
        if (this._yaContainer.current) {
            this._yaContainer.current.style.display = 'none';
            let copyrightEl = this._mapMountEl.querySelector('[class*=copyrights-pane]');
            if (copyrightEl) copyrightEl.style.display = 'none';
        }

        return this;
    }

    yaSyncCenter(e) {
        const center = toLonLat(e.frameState.viewState.center);
        this._yaMap.setCenter([ center[1], center[0] ], this._map.getView().getZoom(), {
            'checkZoomRange': false
        });
    }

    yaSyncSize() {
        const center = toLonLat(this._map.getView().getCenter());
        this._yaMap.container.fitToViewport();
        this._yaMap.setCenter([ center[1], center[0] ], this._map.getView().getZoom());
    }

    initGooMap(layerType) {
        const initPromise = new Promise((resolve, reject) => {
            if (window.google === undefined) {
                const googleApi = document.createElement('script');
                document.getElementsByTagName('head')[0].appendChild(googleApi);

                googleApi.onload =  () => {
                    googleApi.onload = void(0);
                    window.google.load("maps", "3", {
                        callback: () => {
                            resolve()
                        },
                        other_params: 'key=' + this._googleMapsApiKey
                    });
                };

                googleApi.onerror = function () {
                    googleApi.onerror = void(0);
                    reject();
                };

                googleApi.src = `https://www.google.com/jsapi`;
            } else {
                resolve();
            }
        });
        return initPromise.then(() => {
            if (this._gooMap) return;
            let view     = this._map.getView();
            let center   = transform(view.getCenter(), view.getProjection().getCode(), 'EPSG:4326');
            let goCenter = new window.google.maps.LatLng(center[1], center[0]);
            var mapOptions = {
                zoom                  : view.getZoom(),
                center                : goCenter,
                animatedZoom          : false,
                disableDefaultUI      : true,
                keyboardShortcuts     : false,
                draggable             : false,
                disableDoubleClickZoom: true,
                scrollwheel           : false,
                streetViewControl     : false,
                mapTypeId             : window.google.maps.MapTypeId[layerType]
            };
            this._gooMap = new window.google.maps.Map(this._gooContainer.current, mapOptions);
            view.on('change:resolution', () => {
                const needToHide = this._map.getView().getZoom() > 19;
                const isShow = this._gooContainer.current.style.display === "block";
                const currentSource = this.state.baseMaps.find(bm => bm.id === this.state.baseMapId).value
                if (isShow && needToHide) { 
                    this.hideGooMap();
                } else if (!isShow && needToHide) { 
                    this.showGooMap(currentSource);
                }
            });
        })
    }

    showGooMap(layerName) {
        let view      = this._map.getView();
        let center    = transform(view.getCenter(), view.getProjection().getCode(), 'EPSG:4326');
        let goCenter  = new window.google.maps.LatLng(center[1], center[0]);
        let layerType = layerName in sourceAliases ? sourceAliases[layerName] : 'ROADMAP';
        if (view.getZoom() > 19) {
            this.hideGooMap();
        }
        this._gooContainer.current.style.display = "block";
        this._map.un('precompose', this.gooSyncCenter);
        view.un('change:resolution', this.gooSyncZoom);
        this._map.un('change:size', this.gooSyncSize);
        window.google.maps.event.trigger(this._gooMap, 'resize');
        this._gooMap.setOptions({
            zoom  : view.getZoom(),
            center: goCenter
        });
        this._gooMap.setMapTypeId(window.google.maps.MapTypeId[layerType]);
        this._map.on('precompose', this.gooSyncCenter);
        view.on('change:resolution', this.gooSyncZoom);
        this._map.on('change:size', this.gooSyncSize);
    }

    hideGooMap() {
        var view = this._map.getView();
        this._map.un('precompose', this.gooSyncCenter);
        view.un('change:resolution', this.gooSyncZoom);
        this._map.un('change:size', this.gooSyncSize);
        if (this._gooContainer.current) {
            this._gooContainer.current.style.display = "none";
        }
    }

    gooSyncCenter(e) {
        let center = transform(e.frameState.viewState.center, this._map.getView().getProjection().getCode(), 'EPSG:4326');
        this._gooMap.setCenter(new window.google.maps.LatLng(center[1], center[0]));
    }

    gooSyncZoom() {
        let center = this._map.getView().getCenter();
        center     = transform(center, this._map.getView().getProjection().getCode(), 'EPSG:4326');
        this._gooMap.setOptions({
            zoom  : this._map.getView().getZoom(),
            center: new window.google.maps.LatLng(center[1], center[0])
        });
    }

    gooSyncSize() {
        var center = this._map.getView().getCenter();
        center     = transform(center, this._map.getView().getProjection().getCode(), 'EPSG:4326');

        window.google.maps.event.trigger(this._gooMap, 'resize');

        this._gooMap.setOptions({
            zoom  : this._map.getView().getZoom(),
            center: new window.google.maps.LatLng(center[1], center[0])
        });
    }
    setInteractions() {
        const { onHoverChange } = this.props;
        if (!isMobile) {
            this._map.on('pointermove', (e) => {
                let feature = getOlFeatureOnPixel(this._map, e.pixel);
                if (feature) {
                    if (onHoverChange) {
                        const data = getOlFeatureInfoFromSeries(feature, this.props.series);
                        onHoverChange(this.getObjectConfig(data, e, true));
                    }
                    this._mapMountEl.style.cursor = 'pointer';
                } else {
                    if (onHoverChange) {
                        onHoverChange(null);
                    }
                    this._mapMountEl.style.cursor = 'default';
                }
            });
        }
        
        this._map.on('click', this.onMapClick)
    }

    onMapClick(e) {
        const { onVisualizationClick, onHoverChange } = this.props;
        let feature = getOlFeatureOnPixel(this._map, e.pixel);
        if (!feature) {
            if (isMobile && onHoverChange) onHoverChange(null) 
            return;
        }
        const data = getOlFeatureInfoFromSeries(feature, this.props.series);
        if (onVisualizationClick && !isMobile) {
            onVisualizationClick(this.getObjectConfig(data, e));
        }
        if (onHoverChange && isMobile) {
            onHoverChange(this.getObjectConfig(data, e, true))
        }
    }

    updateMapState() {
        const mapParams = this.getMapParams();
        const projection = this._map.getView().getProjection().getCode();
        const center = transform([mapParams[1], mapParams[2]], 'EPSG:4326', projection);
        this._map.getView().setZoom(mapParams[0]);
        this._map.getView().setCenter(center);
    }

    renderBaseMapSwitcher() {
        const { baseMaps, baseMapId } = this.state;
        return <div className={css.omsMapBaseMaps}>
            <Select value={baseMapId}
                    onChange={e => this.setState({baseMapId: e.target.value})}>
                    {baseMaps.map(bm => 
                    <Option 
                        key={bm.id} 
                        name={bm.name} 
                        value={bm.id}>
                        {bm.name}
                    </Option>)}
            </Select>
        </div>  
    }

    renderLegend() {
        return null;
    }

    renderLegendWrapper() {
        const { minLegend } = this.state;
        return <div className={css.omsMapLegendWrapper}>
            <div className={cx(css.omsMapLegend, 'bg-white', 'rounded')}>
                <div className={css.omsMapLegendWrapperHeader}
                     onClick={() => this.setState({minLegend: !minLegend})}>
                    <div className={css.omsMapLegendWrapperHeaderTitle}>Легенда</div>
                   <Icon 
                      name="chevronleft" 
                      className="text-medium" 
                      size={12} 
                      style={{transform: minLegend ? 'rotate(90deg)' : 'rotate(270deg)', cursor: 'pointer'}}
                      title={minLegend ? 'Развернуть легенду' : 'Свернуть легенду'}
                    />
                </div>
                <div className={css.omsMapLegendContentWrapper} style={{padding: minLegend ? 0 : 10}}>
                    {!minLegend && this.renderLegend()}
                </div>
            </div>
        </div>
    }

    render() {
        const { onHoverChange } = this.props;
        const { legend } = this.state;
        return (
            <div
                className={css.omsMap}
                ref={el => this._mapMountEl = el}
                onMouseLeave={() => onHoverChange && onHoverChange(null)}
            >
                <div className={css.yandexBase} ref={this._yaContainer}></div>
                <div className={css.googleBase} ref={this._gooContainer}></div>
                {this.renderBaseMapSwitcher()}
                {legend && this.renderLegendWrapper()}
            </div>
        );
    }
} 

export const OMSOlMap = OMSOlMapComponent;