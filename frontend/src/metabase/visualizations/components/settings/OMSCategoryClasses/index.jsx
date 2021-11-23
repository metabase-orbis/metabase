/* eslint-disable react/prop-types */
import * as React from 'react';
import _ from 'underscore';
import Select from "metabase/components/Select";
import { Distinct } from './distinct.jsx'
import type { Column } from 'metabase-types/types/Dataset';


import css from './style.css';

export type TCategoriesSettings = {
    column: string;
    savedColors: {
        [value: string]: string;
    },
    uncheckedValues: (string | number)[];
    showIcons: {
        [value: string]: boolean;
    };
    iconsPath: {
        [value: string]: string;
    }
};

export interface IUniqueValue {
    value: string | number;
    count: number;
}

export interface IOMSCategoryClassesSettingsComponentProps {
    cols: Column[],
    uniqueValues: IUniqueValue;
    rainbow: string[];
}

export class OMSCategoryClassesSettingsComponent extends React.Component<IOMSCategoryClassesSettingsComponentProps> {
    get cols() {
        return this.props.cols || [];
    }
    get colsWithoutGeom() {
        return this.cols.filter(col => col.name !== 'geom');
    }

    onColumnChange = ({ target }) => {
        this.props.onChange({
            column: target.value,
            savedColors: {},
            uncheckedValues: [],
            showIcons: {},
            iconsPath: {}
        });
    };

    onColorChange = (color, distinct, index) => {
        const currentSettings = this.props.value || {};
        const {
            savedColors = {}
        } = currentSettings;

        const newSavedColors = {...savedColors};

        newSavedColors[distinct.value] = color;
        this.props.onChange({
            ...currentSettings,
            savedColors: newSavedColors
        })
    };

    onCheckedChange = (checked, distinct, index) => {
        const currentSettings = this.props.value || {};
        const {
            uncheckedValues = []
        } = currentSettings;

        let newUncheckedValues = [...uncheckedValues];

        if (checked) {
            newUncheckedValues = _.without(newUncheckedValues, distinct.value);
        } else {
            newUncheckedValues.push(distinct.value);
        }

        this.props.onChange({
            ...currentSettings,
            uncheckedValues: _.unique(newUncheckedValues)
        })
    }

    onShowIconChange = (show, distinct, index) => {
        const currentSettings = this.props.value || {};
        const {
            showIcons = {}
        } = currentSettings;
        const newShowIcons = {...showIcons};

        newShowIcons[distinct.value] = show;
        this.props.onChange({
            ...currentSettings,
            showIcons: newShowIcons
        });
    }

    onChangeIconPath = (path, distinct, index) => {
        const currentSettings = this.props.value || {};
        const {
            iconsPath = {}
        } = currentSettings;
        const newIconsPath = {...iconsPath};
        newIconsPath[distinct.value] = path;
        this.props.onChange({
            ...currentSettings,
            iconsPath: newIconsPath
        });
    }

    renderDistinct = (distinct, index) => {
        const currentSettings = this.props.value || {};
        const {
            savedColors = {},
            uncheckedValues = [],
            showIcons = {},
            iconsPath = {}
        } = currentSettings;
        let color = this.props.rainbow[index];
        
        if (distinct.value in savedColors) {
            color = savedColors[distinct.value];
        }
        
        return (
            <Distinct
                key={distinct.value}
                checked={!uncheckedValues.includes(distinct.value)}
                count={distinct.count}
                value={distinct.value}
                color={color}
                showIcon={showIcons[distinct.value]}
                iconPath={iconsPath[distinct.value]}
                onColorChange={(color) => {
                    this.onColorChange(color, distinct, index);
                }}
                onCheckedChange={(checked) => {
                    this.onCheckedChange(checked, distinct, index);
                }}
                onShowIconChange={(show) => {
                    this.onShowIconChange(show, distinct, index);
                }}
                onChangeIconPath={(path) => {
                    this.onChangeIconPath(path, distinct, index)
                }}
            />

        )
    }

    render() {
        const {
            column = ''
        } = this.props.value || {};
        return (
            <div>
                <Select
                    value={column}
                    onChange={this.onColumnChange}
                    options={this.colsWithoutGeom}
                    optionValueFn={(col) => col.name}
                    optionNameFn={(col) => {
                        return col.display_name;
                    }}
                    placeholder='Колонка'
                />

                <div className={css.distinctsWrapper}>
                    {this.props.uniqueValues.map(this.renderDistinct)}
                </div>

                {/* {  } */}
            </div>
        );
    }
}

export const OMSCategoryClassesSettings = OMSCategoryClassesSettingsComponent;