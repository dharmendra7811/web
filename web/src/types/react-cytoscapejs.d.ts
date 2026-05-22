declare module 'react-cytoscapejs' {
  import React from 'react';
  import cytoscape from 'cytoscape';

  interface CytoscapeComponentProps {
    elements: cytoscape.ElementDefinition[];
    style?: React.CSSProperties;
    stylesheet?: cytoscape.Stylesheet[];
    layout?: cytoscape.LayoutOptions;
    cy?: (cy: cytoscape.Core) => void;
    wheelSensitivity?: number;
    [key: string]: any;
  }

  const CytoscapeComponent: React.ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
