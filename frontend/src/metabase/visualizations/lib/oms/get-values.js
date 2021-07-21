import _ from 'underscore';

/**
 * @param {any[]} rows 
 * @param {number} columnIndex 
 * @returns {{ value: any; count: number }[]}
 */
export const getUniqueValues = (rows, columnIndex) => {
    const valuesMap = new Map();

    if (typeof columnIndex === 'number' && columnIndex !== -1) {
        for (const row of rows) {
            const currentValue = row[columnIndex];
            valuesMap.set(currentValue, (valuesMap.get(currentValue) + 1) || 1);
        }
    }

    let values = [];
    for (const [value, count] of valuesMap.entries()) {
        values.push({ value, count });
    }

    values = _.sortBy(values, 'value');

    return values;
}

export const getValues = (rows, columnIndex) => {
    return rows.map(row => row[columnIndex]);
}