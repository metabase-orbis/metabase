/* eslint-disable react/prop-types */
import React from "react";
import MetabaseSettings from "metabase/lib/settings";
import Calendar from "metabase/components/Calendar";
import moment from "moment";

const DateSingleWidget = ({ value, setValue, onClose }) => {
  value = value ? moment(value) : moment();
  return (
    <Calendar
      initial={value}
      selected={value}
      selectedEnd={value}
      isRangePicker={false}
      onChange={value => {
        setValue(value);
        onClose();
      }}
    />
  );
};

DateSingleWidget.format = value => {
  const format = MetabaseSettings.get('site-locale') === 'ru' ? "DD.MM.YYYY" : "MMMM D, YYYY";
  return value ? moment(value).format(format) : "";
}

export default DateSingleWidget;
