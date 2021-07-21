import React from 'react';

export const usePrevious = (value) => {
    const ref = React.useRef();
    React.useEffect(() => {
        ref.current = value;
    });
    if (ref.current === undefined || ref.current === null) {
        return value;
    } else {
        return ref.current;
    }
};