import { createAction, handleActions } from "metabase/lib/redux";


export const UPDATE_MAP_STATE = 'metabase/mapState/UPDATE_MAP_STATE';

export const updateMapState = createAction(UPDATE_MAP_STATE, (payload) => payload)

export default handleActions(
    {
        [UPDATE_MAP_STATE]: (state, {payload}) => payload
    },
    {
        zoom: 2,
        center: [0, 0]
    }
);