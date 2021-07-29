/**
 * Возвращает рандомный яркий цвет.
 *
 * @return {String}
 */
export const generateColor = () => {

    function componentToHex(c) {
        const hex = Math.round(c).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }

    function rgbToHex(r, g, b) {
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    const i         = Math.random() * (100 - 1) + 1;
    const frequency = 5 / 100;

    const r = Math.sin(frequency * i) * (127) + 128;
    const g = Math.sin(frequency * i + 2) * (127) + 128;
    const b = Math.sin(frequency * i + 4) * (127) + 128;
    return rgbToHex(r, g, b);
}

/**
 * @param {number} noOfColors 
 * @returns {string[]} 
 */
export const generateRainbow = (noOfColors) => {
    let r, g, b;
    const colors = [];
    const frequency = 5 / noOfColors;

    function componentToHex(c) {
        const hex = Math.round(c).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }

    function rgbToHex(r, g, b) {
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    for (let i = 0; i < noOfColors; ++i) {
        r = Math.sin(frequency * i) * (127) + 128;
        g = Math.sin(frequency * i + 2) * (127) + 128;
        b = Math.sin(frequency * i + 4) * (127) + 128;
        colors.push(rgbToHex(r, g, b));
    }
    return colors;
};