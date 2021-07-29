import * as React from 'react';
import PropTypes from 'prop-types';
import Select from 'metabase/components/Select';
import ColorPicker from "metabase/components/ColorPicker";
import Button from "metabase/components/Button";

import css from './pie-field-row.css';

export const PieFieldRow = ({
    onSelectChange,
    onColorChange,
    onDeleteClick,
    columnValue,
    colorValue,
    options
}) => {
    
    const onSelectChangeWrapper = React.useCallback(({ target }) => {
        console.log(target);
        onSelectChange(target.value, columnValue);
    }, [ onSelectChange, columnValue ]);

    const onColorChangeWrapper = React.useCallback((color) => {
        onColorChange(color, columnValue);
    }, [ onColorChange, columnValue ]);

    const onDeleteClickWrapper = React.useCallback(() => {
        onDeleteClick(columnValue);
    }, [onDeleteClick, columnValue]);
    
    return (
        <div className={css.wrapper}>
            <Select
                value={columnValue}
                onChange={onSelectChangeWrapper}
                options={options}
                className={css.select}
            />
            <ColorPicker
                fancy 
                triggerSize={16}
                value={colorValue}
                onChange={onColorChangeWrapper}
            />
            <Button 
                onlyIcon
                icon='close'
                onClick={onDeleteClickWrapper}
            />
        </div>
    )
}

PieFieldRow.propTypes = {
    columnValue: PropTypes.string,
    colorValue: PropTypes.string,
    options: PropTypes.array,
    onSelectChange: PropTypes.func,
    onColorChange: PropTypes.func,
    onDeleteClick: PropTypes.func
}