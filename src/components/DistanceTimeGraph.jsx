import React, { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import "./DistanceTimeGraph.css";

const DistanceTimeGraph = () => {
  const svgRef = useRef();
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [trainData, setTrainData] = useState([]);
  const [filteredTrainData, setFilteredTrainData] = useState([]);

  const fetchTrainData = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:4000/api/trains");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const data = await response.json();
      const parsedData = parseTrainData(data);
      setTrainData(parsedData);
      setFilteredTrainData(parsedData);
    } catch (error) {
      console.error("Error fetching train data:", error);
    }
  }, []);

  const parseTrainData = (data) => {
    if (!data.services) {
      throw new Error("Invalid data structure");
    }

    const parseTime = d3.timeParse("%H%M");
    return data.services.map((service) => {
      const departureTime = parseTime(
        service.locationDetail.origin[0].publicTime
      );
      const arrivalTime = parseTime(
        service.locationDetail.destination[0].publicTime
      );
      const totalDistance = 191; // Distance between London Waterloo and Weymouth in km

      return {
        train: service.trainIdentity,
        trainCode: service.serviceUid,
        journeyDetails: `${service.locationDetail.origin[0].description} to ${service.locationDetail.destination[0].description}`,
        data: [
          {
            time: departureTime,
            distance: 0,
          },
          {
            time: arrivalTime,
            distance: totalDistance,
          },
        ],
      };
    });
  };

  const filterTrains = (count) => {
    const sortedData = [...trainData].sort((a, b) =>
      a.train.localeCompare(b.train)
    );
    const filtered = sortedData.slice(0, count);
    setFilteredTrainData(filtered);
  };

  useEffect(() => {
    fetchTrainData();
  }, [fetchTrainData]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);

    const updateGraph = () => {
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;

      const legendWidth = 200;
      const width = containerWidth - legendWidth;
      const height = containerHeight;

      svg.attr("width", width).attr("height", height);

      const margin = { top: 20, right: 30, bottom: 30, left: 40 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      svg.selectAll("*").remove();

      const allData = filteredTrainData.flatMap((train) => train.data);
      const formatTime = d3.timeFormat("%H:%M");

      const x = d3
        .scaleTime()
        .domain(d3.extent(allData, (d) => d.time))
        .range([margin.left, innerWidth - margin.right]);

      const y = d3
        .scaleLinear()
        .domain([0, 191]) // Distance in kilometers
        .range([innerHeight - margin.bottom, margin.top]);

      const g = svg.append("g");

      const xAxis = g
        .append("g")
        .attr("transform", `translate(0,${innerHeight - margin.bottom})`)
        .call(
          d3
            .axisBottom(x)
            .ticks(innerWidth / 80)
            .tickSizeOuter(0)
            .tickFormat(formatTime)
        );

      const yAxis = g
        .append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
          d3
            .axisLeft(y)
            .ticks(innerHeight / 50)
            .tickSizeOuter(0)
        );

      const color = d3.scaleOrdinal(d3.schemeCategory10);

      const trainLines = filteredTrainData.map((train, i) => {
        const line = d3
          .line()
          .x((d) => x(d.time))
          .y((d) => y(d.distance));

        return g
          .append("path")
          .datum(train.data)
          .attr("fill", "none")
          .attr("stroke", color(i))
          .attr("stroke-width", 2)
          .attr("d", line)
          .style(
            "display",
            selectedTrain && selectedTrain.train !== train.train ? "none" : null
          )
          .on("click", () => setSelectedTrain(train))
          .style("cursor", "pointer")
          .attr("pointer-events", "all");
      });

      const zoom = d3
        .zoom()
        .scaleExtent([0.5, 5])
        .translateExtent([
          [0, 0],
          [width, height],
        ])
        .on("zoom", (event) => {
          const transform = event.transform;
          const newX = transform.rescaleX(x);
          const newY = transform.rescaleY(y);
          xAxis.call(
            d3
              .axisBottom(newX)
              .ticks(innerWidth / 80)
              .tickSizeOuter(0)
              .tickFormat(formatTime)
          );
          yAxis.call(
            d3
              .axisLeft(newY)
              .ticks(innerHeight / 50)
              .tickSizeOuter(0)
          );
          trainLines.forEach((line) => {
            line.attr(
              "d",
              d3
                .line()
                .x((d) => newX(d.time))
                .y((d) => newY(d.distance))
            );
          });
        });

      svg.call(zoom).on("wheel.zoom", null);
    };

    updateGraph();
    window.addEventListener("resize", updateGraph);

    return () => window.removeEventListener("resize", updateGraph);
  }, [selectedTrain, filteredTrainData]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <svg ref={svgRef} style={{ flexGrow: 1 }}></svg>
      <div
        style={{
          width: "200px",
          padding: "10px",
          borderLeft: "1px solid black",
          overflowY: "auto",
        }}
      >
        <h2>Trains</h2>
        <button onClick={() => filterTrains(5)}>Show Top 5 Trains</button>
        <button onClick={() => filterTrains(10)}>Show Top 10 Trains</button>
        <ul>
          {filteredTrainData.map((train, index) => (
            <li
              key={index}
              style={{
                cursor: "pointer",
                color: d3.schemeCategory10[index],
                padding: "10px",
                fontSize: "16px",
              }}
              onClick={() => setSelectedTrain(train)}
            >
              {train.train}
            </li>
          ))}
        </ul>
      </div>

      {selectedTrain && (
        <div className="side-panel">
          <h2>{selectedTrain.train}</h2>
          <p>
            <strong>Train Code:</strong> {selectedTrain.trainCode}
          </p>
          <p>
            <strong>Journey Details:</strong> {selectedTrain.journeyDetails}
          </p>
          <p>
            <strong>Current Distance:</strong>
            {selectedTrain.data[selectedTrain.data.length - 1].distance} km
          </p>
          <button onClick={() => setSelectedTrain(null)}>Close</button>
        </div>
      )}
    </div>
  );
};

export default DistanceTimeGraph;
