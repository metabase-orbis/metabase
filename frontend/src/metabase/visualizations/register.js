import {
  registerVisualization,
  setDefaultVisualization,
} from "metabase/visualizations";

import Scalar from "./visualizations/Scalar";
import SmartScalar from "./visualizations/SmartScalar";
import Progress from "./visualizations/Progress";
import Table from "./visualizations/Table";
import Text from "./visualizations/Text";
import LineChart from "./visualizations/LineChart";
import BarChart from "./visualizations/BarChart";
import WaterfallChart from "./visualizations/WaterfallChart";
import RowChart from "./visualizations/RowChart";
import PieChart from "./visualizations/PieChart";
import AreaChart from "./visualizations/AreaChart";
import ComboChart from "./visualizations/ComboChart";
import MapViz from "./visualizations/Map";
import ScatterPlot from "./visualizations/ScatterPlot";
import Funnel from "./visualizations/Funnel";
import Gauge from "./visualizations/Gauge";
import ObjectDetail from "./visualizations/ObjectDetail";
import PivotTable from "./visualizations/PivotTable";

import { OMSMap } from './visualizations/OMSMap/index';
import { OMSMapCategories } from './visualizations/OMSMapCategories/index';
import { OMSMapThematicMap } from './visualizations/OMSMapThematicMap/index';
import { OMSMapBubble } from './visualizations/OMSMapBubble/index';
import { OMSPieMap } from './visualizations/OMSPieMap/index';

export default function() {
  registerVisualization(Scalar);
  registerVisualization(SmartScalar);
  registerVisualization(Progress);
  registerVisualization(Gauge);
  registerVisualization(Table);
  registerVisualization(Text);
  registerVisualization(LineChart);
  registerVisualization(AreaChart);
  registerVisualization(BarChart);
  registerVisualization(WaterfallChart);
  registerVisualization(ComboChart);
  registerVisualization(RowChart);
  registerVisualization(ScatterPlot);
  registerVisualization(PieChart);

  registerVisualization(OMSMap);
  registerVisualization(OMSMapCategories);
  registerVisualization(OMSMapThematicMap);
  registerVisualization(OMSMapBubble);
  registerVisualization(OMSPieMap);
  
  registerVisualization(MapViz);
  registerVisualization(Funnel);
  registerVisualization(ObjectDetail);
  registerVisualization(PivotTable);
  setDefaultVisualization(Table);
}
