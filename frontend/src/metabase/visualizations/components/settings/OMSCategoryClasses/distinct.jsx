import * as React from 'react';
import PropTypes from "prop-types";
import ColorPicker from "metabase/components/ColorPicker";
import CheckBox from "metabase/components/CheckBox";

import css from './distinct.css';

export interface IDistinctProps {
    count: number;
    value: any;
    color: string;
    checked: boolean;
    onColorChange: (newColor: string) => void;
    onCheckedChange: (checked: boolean) => void;
}

export class Distinct extends React.Component<IDistinctProps> {
    static propTypes = {
        count: PropTypes.number,
        value: PropTypes.any,
        color: PropTypes.string,
        onColorChange: PropTypes.func,
        onCheckedChange: PropTypes.func
    };

    onCheckboxChange = ({ target, preventDefault }) => {
        this.props.onCheckedChange(target.checked);
    }

    render() {
        return (
            <div className={css.distinctWrapper}>
                <CheckBox 
                    className={css.distinctEnabledCheckbox}
                    checked={this.props.checked}
                    onChange={this.onCheckboxChange}
                />
                <div className={css.distinctInfo}>
                    <div className={css.distinctInfoCount}>[{this.props.count}] </div>
                    <div className={css.distinctInfoValue}>{this.props.value}</div>
                </div>
                <div className={css.colorPickerWrapper}>
                    <ColorPicker
                        fancy
                        triggerSize={16}
                        value={this.props.color}
                        onChange={this.props.onColorChange}
                    />
                </div>
            </div>
        );
    }
}