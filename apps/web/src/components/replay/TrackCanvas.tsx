"use client";

import { useEffect, useRef } from "react";
import type { ReplayDriver, ReplayFrame, SafetyCar } from "@/lib/data";

interface TrackCanvasProps {
  trackPath: [number, number][] | null;
  drivers: ReplayDriver[];
  currentFrame: ReplayFrame | null;
  width?: number;
  height?: number;
  selectedDriver?: string | null;
  onDriverClick?: (driverCode: string | null) => void;
}

export function TrackCanvas({
  trackPath,
  drivers,
  currentFrame,
  width = 800,
  height = 600,
  selectedDriver,
  onDriverClick,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);

    if (!trackPath || trackPath.length < 2) {
      ctx.fillStyle = "#666";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Track path not available", width / 2, height / 2);
      return;
    }

    const padding = 40;
    const trackPoints = trackPath;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of trackPoints) {
      if (x !== null && y !== null) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    const trackWidth = maxX - minX || 1;
    const trackHeight = maxY - minY || 1;
    const scaleX = (width - padding * 2) / trackWidth;
    const scaleY = (height - padding * 2) / trackHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - trackWidth * scale) / 2 - minX * scale;
    const offsetY = (height - trackHeight * scale) / 2 - minY * scale;

    function toScreen(x: number, y: number): [number, number] {
      return [x * scale + offsetX, y * scale + offsetY];
    }

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 30 * scale / 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const [startX, startY] = toScreen(trackPoints[0][0], trackPoints[0][1]);
    ctx.moveTo(startX, startY);
    for (let i = 1; i < trackPoints.length; i++) {
      const [x, y] = toScreen(trackPoints[i][0], trackPoints[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 26 * scale / 10;
    ctx.stroke();

    ctx.strokeStyle = "#222";
    ctx.lineWidth = 20 * scale / 10;
    ctx.stroke();

    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (currentFrame) {
      const sc = currentFrame.safetyCar;
      if (sc.phase !== "none" && sc.x !== null && sc.y !== null) {
        const [scX, scY] = toScreen(sc.x, sc.y);
        const scRadius = 12 * scale / 10;

        if (sc.phase === "deploying" || sc.phase === "returning") {
          ctx.fillStyle = "rgba(255, 165, 0, 0.3)";
          ctx.beginPath();
          ctx.arc(scX, scY, scRadius * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = "#FFA500";
        ctx.strokeStyle = "#FF6600";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(scX, scY, scRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#000";
        ctx.font = `bold ${10 * scale / 10}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SC", scX, scY);
      }

      const sortedDrivers = Object.values(currentFrame.drivers).sort((a, b) => a.position - b.position);

      for (const driver of sortedDrivers) {
        if (driver.x === null || driver.y === null) continue;

        const [dx, dy] = toScreen(driver.x, driver.y);
        const teamColor = driver.team
          ? { "Red Bull Racing": "#3671C6", Ferrari: "#E8002D", McLaren: "#FF8000", Mercedes: "#27F4D2", "Aston Martin": "#229971", Alpine: "#FF87BC", Williams: "#64C4FF", RB: "#9BB1FF", "Kick Sauber": "#52E252", "Haas F1 Team": "#B6BABE", Haas: "#B6BABE" }[driver.team] || "#888888"
          : "#888888";

        const isSelected = selectedDriver === driver.driverCode;
        const carRadius = isSelected ? 10 * scale / 10 : 8 * scale / 10;

        if (isSelected) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(dx, dy, carRadius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = teamColor;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(dx, dy, carRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = `bold ${7 * scale / 10}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(driver.driverCode, dx, dy);

        if (isSelected && driver.speed !== null) {
          ctx.fillStyle = "#aaa";
          ctx.font = `${9 * scale / 10}px sans-serif`;
          ctx.fillText(`${Math.round(driver.speed)} km/h`, dx, dy - carRadius - 8);
        }
      }
    }

  }, [trackPath, drivers, currentFrame, width, height, selectedDriver]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onDriverClick || !currentFrame) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!trackPath || trackPath.length < 2) return;

    const padding = 40;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [px, py] of trackPath) {
      if (px !== null && py !== null) {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }

    const trackWidth = maxX - minX || 1;
    const trackHeight = maxY - minY || 1;
    const scaleX = (width - padding * 2) / trackWidth;
    const scaleY = (height - padding * 2) / trackHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (width - trackWidth * scale) / 2 - minX * scale;
    const offsetY = (height - trackHeight * scale) / 2 - minY * scale;

    for (const driver of Object.values(currentFrame.drivers)) {
      if (driver.x === null || driver.y === null) continue;

      const dx = driver.x * scale + offsetX;
      const dy = driver.y * scale + offsetY;
      const dist = Math.sqrt((x - dx) ** 2 + (y - dy) ** 2);

      if (dist < 15) {
        onDriverClick(driver.driverCode);
        return;
      }
    }

    onDriverClick(null);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleClick}
      style={{ display: "block", maxWidth: "100%", cursor: "pointer", borderRadius: "8px" }}
    />
  );
}
