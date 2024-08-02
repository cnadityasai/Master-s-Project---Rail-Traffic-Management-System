import React, { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import "./DistanceTimeGraph.css";

const DistanceTimeGraph = () => {
  const svgRef = useRef();
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [trainData, setTrainData] = useState([]);
  const [filteredTrainData, setFilteredTrainData] = useState([]);

  const fetchDetailedData = useCallback(async (serviceUid) => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");

      const response = await fetch(
        `http://localhost:4000/api/service/${serviceUid}/${year}/${month}/${day}`
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch detailed data for service ${serviceUid}`
        );
      }

      const data = await response.json();
      return parseTrainData(data);
    } catch (error) {
      console.error("Error fetching detailed train data:", error);
      return [];
    }
  }, []);

  const parseTrainData = (data) => {
    if (!data.locations || !data.trainIdentity || !data.serviceUid) {
      throw new Error("Invalid data structure");
    }

    const parseTime = d3.timeParse("%H%M");
    const totalDistance = 191; // Total distance between London Waterloo and Weymouth in km

    const stationDistances = {};
    data.locations.forEach((station, index) => {
      const distance = (index / (data.locations.length - 1)) * totalDistance;
      stationDistances[station.tiploc] = distance;
    });

    return {
      train: data.trainIdentity,
      trainCode: data.serviceUid,
      journeyDetails: `${data.locations[0].description} to ${
        data.locations[data.locations.length - 1].description
      }`,
      data: data.locations.flatMap((station) => {
        const arrivalTime = parseTime(
          station.realtimeArrival || station.gbttBookedArrival
        );
        const departureTime = parseTime(
          station.realtimeDeparture || station.gbttBookedDeparture
        );
        const distance = stationDistances[station.tiploc];
        const points = [];
        if (arrivalTime) {
          points.push({
            time: arrivalTime,
            distance: distance,
            description: station.description,
            type: "arrival",
          });
        }
        if (departureTime) {
          points.push({
            time: departureTime,
            distance: distance,
            description: station.description,
            type: "departure",
          });
        }
        return points;
      }),
    };
  };

  const fetchTrainData = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:4000/api/trains");
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const data = await response.json();
      const detailedDataPromises = data.services.map(async (service) => {
        return fetchDetailedData(service.serviceUid);
      });

      const detailedData = await Promise.all(detailedDataPromises);
      const flattenedData = detailedData.flat();
      setTrainData(flattenedData);
      setFilteredTrainData(flattenedData);
    } catch (error) {
      console.error("Error fetching train data:", error);
    }
  }, [fetchDetailedData]);

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

    const margin = { top: 20, right: 30, bottom: 30, left: 40 };
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const legendWidth = 200;
    const width = containerWidth - legendWidth;
    const height = containerHeight;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const updateGraph = () => {
      svg.attr("width", width).attr("height", height);

      svg.selectAll("*").remove();

      const currentTime = new Date();
      const allData = filteredTrainData.flatMap((train) =>
        train.data.filter((d) => d.time <= currentTime)
      );

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
            .tickFormat(d3.timeFormat("%H:%M"))
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

      const line = d3
        .line()
        .x((d) => x(d.time))
        .y((d) => y(d.distance));

      filteredTrainData.forEach((train, i) => {
        const trainData = train.data.filter((d) => d.time <= currentTime);

        g.append("path")
          .datum(trainData)
          .attr("fill", "none")
          .attr("stroke", color(i))
          .attr("stroke-width", 2)
          .attr("d", line)
          .style(
            "display",
            selectedTrain && selectedTrain.train !== train.train ? "none" : null
          )
          .on("click", () => setSelectedTrain(train))
          .style("cursor", "pointer");

        if (trainData.length > 0) {
          g.append("circle")
            .attr("cx", x(trainData[trainData.length - 1].time))
            .attr("cy", y(trainData[trainData.length - 1].distance))
            .attr("r", 4)
            .attr("fill", color(i));
        }

        trainData.forEach((location) => {
          if (location.description) {
            g.append("circle")
              .attr("cx", x(location.time))
              .attr("cy", y(location.distance))
              .attr("r", 5)
              .attr("fill", location.type === "arrival" ? "green" : "blue")
              .append("title")
              .text(`${location.description} (${location.type})`);
          }
        });
      });

      // Add vertical line for the current time
      g.append("line")
        .attr("x1", x(currentTime))
        .attr("x2", x(currentTime))
        .attr("y1", y(0))
        .attr("y2", y(191)) // Ensure this extends the full height
        .attr("stroke", "black")
        .attr("stroke-width", 3)
        .attr("stroke-dasharray", "5,5");

      const zoom = d3
        .zoom()
        .scaleExtent([0.5, 5])
        .translateExtent([
          [0, 0],
          [width, height],
        ])
        .on("zoom", (event) => {
          const { transform } = event;
          const newX = transform.rescaleX(x);
          const newY = transform.rescaleY(y);

          xAxis.call(
            d3
              .axisBottom(newX)
              .ticks(innerWidth / 80)
              .tickSizeOuter(0)
              .tickFormat(d3.timeFormat("%H:%M"))
          );
          yAxis.call(
            d3
              .axisLeft(newY)
              .ticks(innerHeight / 50)
              .tickSizeOuter(0)
          );

          g.selectAll("path").attr("d", (d) => {
            const data = d || [];
            return line
              .x((d) => (d && d.time ? newX(d.time) : newX(new Date(0))))
              .y((d) => (d && d.distance ? newY(d.distance) : newY(0)))(data);
          });

          g.selectAll("circle")
            .attr("cx", (d) => (d && d.time ? newX(d.time) : newX(new Date(0))))
            .attr("cy", (d) => (d && d.distance ? newY(d.distance) : newY(0)));

          g.selectAll("line")
            .attr("x1", newX(currentTime))
            .attr("x2", newX(currentTime))
            .attr("y1", newY(0))
            .attr("y2", newY(191));
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
