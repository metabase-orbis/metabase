import * as React from 'react';
import PropTypes from 'prop-types';
import ChartSettingInputNumeric from 'metabase/visualizations/components/settings/ChartSettingInputNumeric';

import css from './style.css';

export const OMSNumberRange = ({
    value,
    onChange
}) => {

    const [fromValue, toValue] = value;

    const onFromValueChange = React.useCallback((value) => {
        onChange([value, toValue]);
    }, [onChange, toValue]);

    const onToValueChange = React.useCallback((value) => {
        onChange([fromValue, value]);
    }, [onChange, fromValue]);

    return (
        <div className={css.omsInputNumberRange}>
            <div className={css.omsInputNumberRangeItem}>
                <div className={css.omsInputNumberRangeItemLabel}>
                    от (px)
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
                    до (px)
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
    onChange: PropTypes.func
};