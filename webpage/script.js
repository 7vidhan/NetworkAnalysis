const svgSize = 720;
const gridSize = 4; // 5x5 grid
const totalNodes = gridSize * gridSize; // 25 nodes

const svgWidth = 720;
const svgHeight = 480;

// Draw Graph
const graphSvg = d3.select("#graph");
const nodeRadius = 3;
const edgeLen = 10;

["#graph"].forEach(id => {
    d3.select(id)
        .attr("width", svgWidth)
        .attr("height", svgHeight)
        .style("border", "1px solid black"); ;
});

let nodes = [];
let links = [];

// Load nodes first
d3.csv("../asset/nodes.csv").then(nodeData => {
    nodes = nodeData.map(d => ({
        id: d.ID
    }));

    // Load links after nodes are ready
    d3.csv("../asset/edges.csv").then(edgeData => {
        links = edgeData.map(d => ({
            source: d.member1,
            target: d.member2
        }));

        // Now that nodes & links are loaded, create the force simulation
        initGraph();
    });
});

function initGraph() {
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(30))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(svgWidth / 2, svgHeight / 2))
        .force("x", d3.forceX(svgWidth / 2).strength(0.20))
        .force("y", d3.forceY(svgHeight / 2).strength(0.30))
        .force("collide", d3.forceCollide().radius(3));

    // Draw links
    const link = graphSvg.append("g")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("class", "link");

    // Draw nodes (group circle + optional label)
    const nodeGroup = graphSvg.selectAll(".node-group")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node-group")
        .on("mouseenter", (_, d) => highlightNode(d.id))
        .on("mouseleave", clearHighlight)
        .on("click", (_, d) => toggleSelection(d.id))
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)
        );

    nodeGroup.append("circle")
        .attr("class", "node")
        .attr("r", nodeRadius);

    // Update positions each tick
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        nodeGroup
            .attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
        }

// Highlight functions
function highlightNode(nodeId) {
    graphSvg.selectAll("g.node-group")
        .select("circle.node")
        .classed("highlight", d => d.id === nodeId);

    graphSvg.selectAll("line.link")
        .classed("highlight", l => l.source.id === nodeId || l.target.id === nodeId);

    // // Graph: highlight node label
    graphSvg.selectAll("text.node-label")
        .classed("highlight", d => d.id === nodeId);
}

function highlightEdge(sourceId, targetId) {
    // Graph: highlight node label
    graphSvg.selectAll("text.node-label")
        .classed("highlight", d => d.id === sourceId || d.id === targetId);
    
    
    graphSvg.selectAll("line.link")
        .classed("highlight", l =>
            (l.source.id === sourceId && l.target.id === targetId) ||
            (l.source.id === targetId && l.target.id === sourceId)
        );
}

function clearHighlight() {
    d3.selectAll(".highlight").classed("highlight", false);
}

function toggleSelection(nodeId) {
    // Toggle graph node
    graphSvg.selectAll("circle.node")
        .filter(d => d.id === nodeId)
        .classed("selected", function () {
            return !d3.select(this).classed("selected");
        });
}