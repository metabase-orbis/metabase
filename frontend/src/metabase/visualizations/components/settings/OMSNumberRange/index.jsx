import * as React from 'react';
import PropTypes from 'prop-types';
import ChartSettingInputNumeric from 'metabase/visualizations/components/settings/ChartSettingInputNumeric';

import css from './style.css';

//taking from http://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric
const isNumber = function (n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
};


export const OMSNumberRange = ({
    value,
    onChange,
    min,
    max,
    labels = []
}) => {

    const [fromValue, toValue] = value;

    const onFromValueChange = React.useCallback((value) => {
        onChange([
            isNumber(min) && (value < min) ? min : value,
            toValue
        ]);
    }, [onChange, toValue, min]);

    const onToValueChange = React.useCallback((value) => {
        onChange([
            fromValue,
            isNumber(max) && (value > max) ? max : value
        ]);
    }, [onChange, fromValue, max]);

    React.useEffect(() => {
        const newValue = [fromValue, toValue];
        let changed = false;
        if (isNumber(min) && (newValue[0] < min)) {
            newValue[0] = min;
            changed = true;
        }

        if (isNumber(max) && (newValue[1] > max)) {
            newValue[1] = max;
            changed = true;
        }

        if (changed) {
            onChange(newValue);
        }
    }, 
        /* eslint-disable-next-line */
        []
    );

    return (
        <div className={css.omsInputNumberRange}>
            <div className={css.omsInputNumberRangeItem}>
                <div className={css.omsInputNumberRangeItemLabel}>
                    {labels[0] || 'от'}
                </div>
                <div className={css.omsInputNumberRangeItemComponent}>
                    <ChartSettingInputNumeric
                        value={fromValue}
                        onChange={onFromValueChange}
                    />
                </div>
            </div>

            <div className={css.omsInputNumberRangeItem}>
                <div className={css.omsInputNumberRangeItemLabel}>
                    {labels[1] || 'до'}
                </div>
                <div className={css.omsInputNumberRangeItemComponent}>
                    <ChartSettingInputNumeric
                        value={toValue}
                        onChange={onToValueChange}
                    />
                </div>
            </div>
        </div>
    );
};

OMSNumberRange.propTypes = {
    value: PropTypes.array,
    onChange: PropTypes.func,
    min: PropTypes.number,
    max: PropTypes.number,
    labels: PropTypes.array
};