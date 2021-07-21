import _ from 'underscore';

/**
 * @param {any[]} cols Массив всех колонок
 * @param {string | null} columnName Имя колонки
 * @returns {number} Индекс колонки
 */
export const getColumnIndexByName = (cols, columnName) => {
    if (!columnName) {
        return -1;
    } else {
        return _.findIndex(cols, c => c.name === columnName);
    }
}