import * as React from 'react';
import ViewButton from 'metabase/query_builder/components/view/ViewButton'
import PropTypes from 'prop-types';
import cx from "classnames";
import css from './styles.css';

export const OMSInputGroup = (props) => {
    const handleChange = (value, index) => {
        const newValue = [...props.value];
        newValue[index] = value;
        props.onChange(newValue);
    }
    const handleClick = () => {
        props.onChange(props.setValue)
    }

    const renderInput = (i) => {
        return <div key={props.names[i] || i}>
        {props.names[i] && <p className={css.omsInputGroupTitle}>{props.names[i]}</p>}
        <input 
            className={cx('input', 'block', 'full', css.omsInputGroupInput)}
            type={props.types[i] || 'text'}
            value={props.value[i]}
            onChange={(e) => handleChange(e.target.value, i)}
        />  
        </div>
    };

    return <div className={css.omsInputGroupControl}>
        {props.value.map((v, i) => renderInput(i))}
        {props.setValue && <ViewButton 
                active
                px={4}
                ml="auto"
                mr="auto"
                mb={2}
                mt={1}
                className={cx('circular', 'shadowed', css.omsInputGroupButton)}
                onClick={handleClick}>
                    {props.setValueTitle || 'Set Value'}
        </ViewButton>}
    </div>
}

OMSInputGroup.propTypes = {
    value: PropTypes.array,
    names: PropTypes.array,
    onChange: PropTypes.func,
    setValue: PropTypes.array,
    setValueTitle: PropTypes.string,
    types: PropTypes.array,
}