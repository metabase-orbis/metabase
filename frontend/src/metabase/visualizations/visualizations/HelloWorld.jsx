/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ReactMarkdown from "react-markdown";
import Button from 'metabase/components/Button';
import styles from './HelloWorld.css';

import cx from "classnames";
import { t } from "ttag";

import type { VisualizationProps } from "metabase-types/types/Visualization";

type State = {
};

const getSettingsStyle = settings => ({
    "align-center": settings["text.align_horizontal"] === "center",
    "align-end": settings["text.align_horizontal"] === "right",
    "justify-center": settings["text.align_vertical"] === "middle",
    "justify-end": settings["text.align_vertical"] === "bottom",
});

export default class HelloWorld extends Component {
    props: VisualizationProps;
    state: State;

    constructor(props: VisualizationProps) {
        super(props);
    }

    static uiName = "ALO";
    static identifier = "ALO";
    static iconName = "duane";

    static minSize = { width: 4, height: 1 };

    static checkRenderable() {
        // text can always be rendered, nothing needed here
    }

    static settings = {
        "helloworld.duane": {
            section: t`DUANE`,
            title: t`SHOW DUANE`,
            //   dashboard: true,
            widget: "toggle",
            default: true,
        },
    };

    render() {
        console.log(this.props);
        return (
            <div className={styles.HelloWorld}>
                <h1>Hello World!</h1>
                {this.props.settings['helloworld.duane'] && <img src="app/img/duane.gif" />}
            </div>
        );
    }
}
