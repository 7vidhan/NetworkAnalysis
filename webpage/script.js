const svgSize = 720;
const svgWidth = 750;
const svgHeight = 480;
const nodesCount = 890
// Draw Graph
const graphSvg = d3.select("#graph");
const nodeRadius = 5;
const edgeLen = 10;
let maxTimestep = 0;
let currentTimestep = 0;
let playInterval;
let animationInterval = null;
let isPlaying = false;
let voterankCurrentStep = 0;
let voterankAnimation = null;
let maxVoterankTimestep = 0;

// Populate dropdown after loading centralities
const centralityMeasures = [
  { key: "degree_centrality", label: "Degree Centrality" },
  { key: "closeness_centrality", label: "Closeness Centrality" },
  { key: "betweenness_centrality", label: "Betweenness Centrality" },
  { key: "current_flow_closeness", label: "Current Flow Closeness" },
  { key: "current_flow_betweenness", label: "Current Flow Betweenness" },
  { key: "eigenvector_centrality", label: "Eigenvector Centrality" },
  { key: "load_centrality", label: "Load Centrality" },
  { key: "subgraph_centrality", label: "Subgraph Centrality" },
  { key: "harmonic_centrality", label: "Harmonic Centrality" },
  { key: "communicability_betweenness", label: "Communicability Betweenness" },
  { key: "laplacian_centrality", label: "Laplacian Centrality" }
];



["#graph"].forEach(id => {
    d3.select(id)
        .attr("width", svgWidth)
        .attr("height", svgHeight)
        .style("border", "1px solid black"); ;
});

let nodes = [];
let links = [];
let graph_centrality = {};
let infectionData = {};
let voterankHistory = [];
let simulation;

// Load files
Promise.all([
  d3.csv("https://raw.githubusercontent.com/7vidhan/NetworkAnalysis/main/webpage/asset/nodes.csv"),
  d3.csv("https://raw.githubusercontent.com/7vidhan/NetworkAnalysis/main/webpage/asset/edges.csv"),
  d3.csv("https://raw.githubusercontent.com/7vidhan/NetworkAnalysis/main/webpage/asset/graph_centralities.csv"),
  d3.csv("https://raw.githubusercontent.com/7vidhan/NetworkAnalysis/main/webpage/asset/infection_history.csv"),
  d3.csv("https://raw.githubusercontent.com/7vidhan/NetworkAnalysis/main/webpage/asset/voting_history.csv")
]).then(([nodeData, edgeData, centData, infData, voteData]) => {
  
  // Prepare centrality object keyed by ID
  centData.forEach(d => {
    graph_centrality[d.ID] = {
      degree_centrality: parseInt(Math.round(+d.degree_centrality * (nodesCount - 1)), 10),
      closeness_centrality: +d.closeness_centrality,
      betweenness_centrality: +d.betweenness_centrality,
      current_flow_closeness: +d.current_flow_closeness,
      current_flow_betweenness: +d.current_flow_betweenness,
      eigenvector_centrality: +d.eigenvector_centrality,
      load_centrality: +d.load_centrality,
      subgraph_centrality: +d.subgraph_centrality,
      harmonic_centrality: +d.harmonic_centrality,
      communicability_betweenness: +d.communicability_betweenness,
      laplacian_centrality: +d.laplacian_centrality
    };
  });

  // Create nodes array, attach centrality data
  nodes = nodeData.map(d => ({
    id: d.ID,
    centrality: graph_centrality[d.ID] || {}
  }));

  // Create links array
  links = edgeData.map(d => ({
    source: d.member1,
    target: d.member2
  }));

  // Load infection data by timestep
  infData.forEach(d => {
    const t = +d.timestep;
    if (!infectionData[t]) infectionData[t] = {};
    infectionData[t][d.node] = { infected: +d.infected, risky: +d.risky };
    if (t > maxTimestep) maxTimestep = t;
  });

  voteData.forEach(d => {
    const t = +d.timestep;
    if (!voterankHistory[t]) voterankHistory[t] = {};
    voterankHistory[t][d.node] = { type: d.type };
    if (t > maxVoterankTimestep) maxVoterankTimestep = t;
  });  

  // Now initialize the graph
  initGraph();
});

// Tooltip
const tooltip = d3.select("body").append("div")
  .attr("id", "tooltip")
  .style("position", "absolute")
  .style("background", "#efe0b4ff")
  .style("border", "1px solid #efe0b4ff")
  .style("padding", "6px")
  .style("border-radius", "4px")
  .style("font-size", "12px")
  .style("display", "none")
  .style("pointer-events", "none");

// Dropdown
const dropdown = d3.select("#centralityDropdown");
dropdown.selectAll("option")
  .data(centralityMeasures)
  .enter()
  .append("option")
  .attr("value", d => d)
  .attr("value", d => d.key)   // store key as value
  .text(d => d.label);          // human-readable label

// Button click: highlight top N nodes
d3.select("#highlightBtn").on("click", () => {
  const measure = dropdown.node().value;
  const topN = +document.getElementById("topN").value;

  // Sort nodes by selected centrality and take top N
  const sortedNodes = nodes
    .map(d => ({ ...d, value: graph_centrality[d.id][measure] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);

  const topNodeIds = new Set(sortedNodes.map(d => d.id));

  // Highlight nodes in graph
  graphSvg.selectAll("circle.node")
    .classed("selected", d => topNodeIds.has(d.id));
});

// Add event listener for clear button
d3.select("#clearBtn").on("click", () => {
    graphSvg.selectAll("circle.node")
        .classed("selected", false)
        .classed("infected", false)
        .classed("risky", false)
        .classed("normal", false)
        .classed("people", false)
        .classed("influencer", false)
        .classed("crowd", false);
    stopAnimation();
    currentTimestep = 0;

});

// Percolation Buttons###########################################
d3.select("#prevStepBtn").on("click", () => {
  if (currentTimestep > 0) updatePercolation(currentTimestep - 1);
});

d3.select("#nextStepBtn").on("click", () => {
  if (currentTimestep < maxTimestep) updatePercolation(currentTimestep + 1);
});

// Connect buttons
d3.select("#playBtn").on("click", playAnimation);
d3.select("#resetBtn").on("click", () => {
  stopAnimation();
  currentTimestep = 0;
  updatePercolation(currentTimestep);
});

// VoteRank######################################################
d3.select("#voterankResetBtn").on("click", () => {
    voterankCurrentStep = 0;
    stopVoterankAnimation();
    updateVoterankStep(voterankCurrentStep);
});

d3.select("#voterankPrevStepBtn").on("click", () => {
    if (voterankCurrentStep > 0) voterankCurrentStep--;
    updateVoterankStep(voterankCurrentStep);
});

d3.select("#voterankNextStepBtn").on("click", () => {
    if (voterankCurrentStep < voterankHistory.length-1) voterankCurrentStep++;
    updateVoterankStep(voterankCurrentStep);
});

d3.select("#voterankPlayBtn").on("click", () => {
    if (voterankAnimation) return; // already playing
    voterankAnimation = setInterval(() => {
        if (voterankCurrentStep >= voterankHistory.length-1) {
            stopVoterankAnimation();
        } else {
            voterankCurrentStep++;
            updateVoterankStep(voterankCurrentStep);
        }
    }, 1000);
});


// #########################################################################
// FUNCTIONS DEFINED HERE
// #########################################################################


function initGraph() {
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(30))
        .force("charge", d3.forceManyBody().strength(-30))
        .force("center", d3.forceCenter(svgWidth / 2, svgHeight / 2))
        .force("x", d3.forceX(svgWidth / 2).strength(0.20))
        .force("y", d3.forceY(svgHeight / 2).strength(0.35))
        .force("collide", d3.forceCollide().radius(3));

    // Draw links
    const link = graphSvg.append("g")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("class", "link");

    // Draw nodes / group circle
    const nodeGroup = graphSvg.selectAll(".node-group")
        .data(nodes)
        .enter().append("g")
        .attr("class", "node-group")
        .on("mouseenter", (_, d) => {
            highlightNode(d.id);
            showTooltip(_,d);
        })
        .on("mouseleave", (_, d) => {
            clearHighlight();
            hideTooltip();
        })
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

// ###################################
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

// ##############################################
// TOOLTIP
function showTooltip(event, d) {
  const selectedMeasure = d3.select("#centralityDropdown").property("value");
  const cent = graph_centrality[d.id];
  console.log(cent);  // get centrality from global object
  if (!cent) return;  // safety check

  let val = cent[selectedMeasure];
  if(selectedMeasure !== "degree_centrality"){
    val = val?.toFixed(3);
  }

  tooltip.style("display", "block")
    .html(`
      <b>ID:</b> ${d.id}<br>
      <b>${selectedMeasure.replace(/_/g, " ")}:</b> ${val}<br>
    `)
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY + 10) + "px");
}

function hideTooltip() {
  tooltip.style("display", "none");
}

// ###########################################
// CENTRALITY
function updateHighlight() {
    const centrality = dropdown.property("value");
    const topN = +topNInput.property("value");

    // Sort nodes by selected centrality descending
    const topNodes = nodes
        .map(d => ({ id: d.id, value: graph_centrality[d.id][centrality] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, topN)
        .map(d => d.id);

    // Clear previous highlights
    graphSvg.selectAll("circle.node").classed("selected", false);

    // Highlight top nodes
    graphSvg.selectAll("circle.node")
        .filter(d => topNodes.includes(d.id))
        .classed("selected", true);
}

// ###########################################
// Percolation
function updatePercolation(timestep) {
  currentTimestep = timestep;

  const stepData = infectionData[timestep];
  if (!stepData) return;

  graphSvg.selectAll("circle.node")
    .each(function(d) {
      const nodeData = stepData[d.id];
      d3.select(this)
        .classed("infected", nodeData?.infected === 1)
        .classed("risky", nodeData?.risky === 1)
        .classed("normal", !(nodeData?.infected === 1 || nodeData?.risky === 1));
    });
}

function playAnimation() {
  if (isPlaying) return;
  isPlaying = true;
  animationInterval = setInterval(() => {
    currentTimestep++;
    if (currentTimestep >= maxTimestep) {
      currentTimestep = 0; // or stop
      clearInterval(animationInterval);
      isPlaying = false;
    }
    updatePercolation(currentTimestep);
  }, 1000); // adjust speed
}

function stopAnimation() {
  clearInterval(animationInterval);
  isPlaying = false;
}


// ###########################################
// VoteRank
function updateVoterankStep(step) {
    voterankCurrentStep = step;
    const stepData = voterankHistory[step];
    if (!stepData) return;

    // Reset all nodes first
    graphSvg.selectAll("circle.node")
        .each(function(d) {
            const nodeStatus = stepData[d.id];

            // Reset all classes first
            d3.select(this)
                .classed("people", false)
                .classed("influencer", false)
                .classed("crowd", false);

            if (!nodeStatus || nodeStatus.type === "people") {
                d3.select(this).classed("people", true);
            } else if (nodeStatus.type === "influencer") {
                d3.select(this).classed("influencer", true);
            } else if (nodeStatus.type === "crowd") {
                d3.select(this).classed("crowd", true);
            }
        });
}

function stopVoterankAnimation() {
    clearInterval(voterankAnimation);
    voterankAnimation = null;
}