/* eslint-disable react/prop-types */

import * as React from 'react';
import classNames from 'classnames';
import Select from 'metabase/components/Select';
import { usePrevious } from 'metabase/visualizations/lib/oms/hooks';
import css from './style.css';

export interface OMSThematicMapColorSchemeProps {
    palette: 2 | 3;
    value: number;
    onChange: (newValue: number) => void;
}

const threeClrTheme = [
    [ "#ffffcc", "#00bfaf", "#002080" ],
    [ "#eaf8ff", "#64d0ad", "#005824" ],
    [ "#f2f2f2", "#9f82d9", "#001933" ],
    [ "#ffffbf", "#ff6a00", "#990000" ],
    [ "#1f991f", "#fffabf", "#bf3030" ],
    [ "#0066cc", "#fffabf", "#bf3030" ],
    [ "#6000bf", "#f2f2f2", "#bf4000" ],
    [ "#00818c", "#f2f2f2", "#bf0000" ],
    [ "#b35900", "#e5f9ff", "#002f8c" ],
    [ "#b3369e", "#e5f0ff", "#005673" ]
];

const twoClrTheme = [
    [ "#f2f2f2", "#1a1a1a" ],
    [ "#f2f2f2", "#1f5299" ],
    [ "#e5f9ff", "#006080" ],
    [ "#e5ffec", "#1a8033" ],
    [ "#ffe5e5", "#b32d00" ],
    [ "#fffabf", "#b35900" ],
    [ "#a60000", "#ffe5e5" ],
    [ "#00698c", "#e5fbff" ],
    [ "#004080", "#e5f4ff" ],
    [ "#5d29a6", "#fde5ff" ]
];

export const getColorTheme = (palette, value) => {
    if (palette === 3) {
        return threeClrTheme[value];
    } else if (palette === 2) {
        return twoClrTheme[value];
    } else {
        return '#000000';
    }
}

export const OMSThematicMapColorScheme: React.FC<OMSThematicMapColorSchemeProps> = ({
    palette,
    value,
    onChange
}) => {

    const prevPalette = usePrevious(palette);

    React.useEffect(() => {
        if (palette !== prevPalette) {
            onChange(0);
        }
    }, [ palette, prevPalette, onChange ]);

    const generateOptions = React.useCallback(() => {
        if (palette === 3) {
            return threeClrTheme.map((colorArray, index) => ({
                value: index,
                name: index
            }));
        } else {
            return twoClrTheme.map((colorArray, index) => ({
                value: index,
                name: index
            }))
        }
    }, [ palette ]);

    const onSelectChange = React.useCallback(({ target: { value } }) => {
        onChange(value);
    }, [ onChange ]);

    const optionClassNameFn = React.useCallback((...args) => css.colorSchemeOptionWrapper, []);

    const optionNameFn = React.useCallback(({ value }, index, options) => {
        if (palette === 3) {
            const colorArray = threeClrTheme[value];
            return (
                <div className={classNames(css.paletteColors, css.threeClrs)}>
                    <div className={css.paletteColorItem} style={{ backgroundColor: colorArray[0] }}></div>
                    <div className={css.paletteColorItem} style={{ backgroundColor: colorArray[1] }}></div>
                    <div className={css.paletteColorItem} style={{ backgroundColor: colorArray[2] }}></div>
                </div>
            )
        } else {
            const colorArray = twoClrTheme[value];
            return (
                <div className={classNames(css.paletteColors, css.twoClrs)}>
                    <div className={css.paletteColorItem} style={{ backgroundColor: colorArray[0] }}></div>
                    <div className={css.paletteColorItem} style={{ backgroundColor: colorArray[1] }}></div>
                </div>
            )
        }

    }, [ palette ]);
    
    return (
        <Select 
            value={value}
            optionClassNameFn={optionClassNameFn}
            onChange={onSelectChange}
            optionNameFn={optionNameFn}
            options={generateOptions()}
            buttonProps={{
                className: css.selectButton
            }}
        />
    );
}