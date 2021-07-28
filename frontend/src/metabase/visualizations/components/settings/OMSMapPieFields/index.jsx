import * as React from 'react';
import _ from 'underscore';
import PropTypes from 'prop-types';
import Select from 'metabase/components/Select';
import { getOptionFromColumn } from 'metabase/visualizations/lib/settings/utils';
import { PieFieldRow } from './pie-field-row';

import css from './style.css';

export const OMSMapPieFields = ({
    value,
    cols,
    onChange
}) => {

    const getOptions = React.useCallback((/** @type {string[]} */ keepColumns = []) => {
        /** @type {string[]} */
        let selectedColumns = value.map((c) => c.name);
        selectedColumns = _.without(selectedColumns, ...keepColumns);
        
        return cols.filter((col) => !selectedColumns.includes(col.name)).map(getOptionFromColumn);
    }, [ cols, value ]);

    const onRowSelectChange = React.useCallback((newColumnValue, oldColumnValue) => {
        const colObj = value.find((col) => col.name === oldColumnValue);
        
        if (colObj) {
            const newValue = [...value];

            newValue.splice(value.indexOf(colObj), 1, {
                name: newColumnValue,
                color: colObj['color']
            });
            
            onChange(newValue);
        }
    }, [ value, onChange ]);
    
    const onRowColorChange = React.useCallback((newColor, columnName) => {
        const colObj = value.find((col) => col.name === columnName);

        if (colObj) {
            const newValue = [...value];

            newValue.splice(value.indexOf(colObj), 1, {
                name: colObj['name'],
                color: newColor
            });

            onChange(newValue);
        }
    }, [ value, onChange ]);

    const renderColumnSelect = React.useCallback((/** @type {{ name: string; color: string }} */ column) => {
        return (
            <PieFieldRow 
                key={column.name}
                columnValue={column.name}
                colorValue={column.color}
                options={getOptions([ column.name ])}
                onSelectChange={onRowSelectChange}
                onColorChange={onRowColorChange}
                onDeleteClick={() => {}}
            />
        )
    }, [ getOptions, onRowSelectChange, onRowColorChange ]);

    const onNewColumnSelectChange = React.useCallback(({ target }) => {
        onChange([
            ...value,
            {
                name: target.value,
                color: '#ff00ff'
            }
        ])
    }, [ onChange, value ]);

    const newFieldSelectOptions = getOptions();
    return (
        <div className={css.pieFieldsWrapper}>
            <div className={css.fieldsWrapper}>
                {value.map(renderColumnSelect)}
            </div>

            <div className={css.newFieldWrapper}>
                {
                    !!newFieldSelectOptions.length && (
                        <Select
                            value={null}
                            options={newFieldSelectOptions}
                            onChange={onNewColumnSelectChange}
                        />
                    )
                }
            </div>
        </div>
    );
}

OMSMapPieFields.propTypes = {
    cols: PropTypes.array,
    value: PropTypes.arrayOf(
        PropTypes.exact({
            name: PropTypes.string,
            color: PropTypes.string
        })
    ),

    onChange: PropTypes.func
}