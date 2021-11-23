import * as React from 'react';
import PropTypes from "prop-types";
import ColorPicker from "metabase/components/ColorPicker";
import CheckBox from "metabase/components/CheckBox";
import Radio from 'metabase/components/Radio';
import Input from 'metabase/components/Input';

import css from './distinct.css';

export interface IDistinctProps {
    count: number;
    value: any;
    color: string;
    showIcon: Boolean;
    checked: boolean;
    iconPath: string;
    onColorChange: (newColor: string) => void;
    onCheckedChange: (checked: boolean) => void;
    onShowIconChange: (show: Boolean) => void;
    onChangeIconPath: (path: string) => void;
}

export class Distinct extends React.Component<IDistinctProps> {
    static propTypes = {
        count: PropTypes.number,
        value: PropTypes.any,
        color: PropTypes.string,
        showIcon: PropTypes.bool,
        iconPath: PropTypes.string,
        onColorChange: PropTypes.func,
        onCheckedChange: PropTypes.func,
        onShowIconChange: PropTypes.func,
        onChangeIconPath: PropTypes.func
    };

    constructor(props) {
        super(props);
        this.renderColorPicker = this.renderColorPicker.bind(this);
        this.renderIconInput = this.renderIconInput.bind(this);
    }

    onCheckboxChange = ({ target, preventDefault }) => {
        this.props.onCheckedChange(target.checked);
    }

    onRadioChange = (value) => {
        this.props.onShowIconChange(value === 'icon') 
    }

    renderColorPicker() {
        return <div className={css.colorPickerWrapper}>
            <ColorPicker
                fancy
                triggerSize={16}
                value={this.props.color}
                onChange={this.props.onColorChange}
            />
        </div>
    }

    renderIconInput() {
        return <Input placeholder="Путь к иконке" 
                    value={this.props.iconPath} 
                    onChange={e => this.props.onChangeIconPath(e.target.value)} 
                    disabled={!this.props.showIcon}
                />    
    }

    render() {
        return (
            <div className={css.distinctWrapper}>
                <div className={css.distinctNameWrapper}>
                    <CheckBox 
                        className={css.distinctEnabledCheckbox}
                        checked={this.props.checked}
                        onChange={this.onCheckboxChange}
                    />
                    <div className={css.distinctInfo}>
                        <div className={css.distinctInfoCount}>[{this.props.count}] </div>
                        <div className={css.distinctInfoValue}>{this.props.value}</div>
                    </div>
                </div>
                <div className={css.distinctOptionsWrapper}>
                    <Radio  options={[
                                {name: this.renderColorPicker(), value: 'color'}, 
                                {name: this.renderIconInput(), value: 'icon'}]} 
                            showButtons
                            value={this.props.showIcon ? 'icon' : 'color'}
                            className={css.distinctRadio}
                            onChange={this.onRadioChange} />   
                </div>
               
            </div>
        );
    }
}