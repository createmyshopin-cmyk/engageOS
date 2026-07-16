"use client";

import React, { useRef, useState, useEffect } from "react";
import { Sparkles, Check, ArrowRight, RefreshCw, MessageSquare } from "lucide-react";

export function CampaignSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isScratched, setIsScratched] = useState(false);
  const [scratchProgress, setScratchProgress] = useState(0);
  const [gameState, setGameState] = useState<"scratch" | "form" | "success">("scratch");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);

  // Initialize canvas with silver/gold scratch layer
  useEffect(() => {
    initCanvas();
    
    // Resize observer to handle dynamic rendering changes
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(() => {
      // Only re-init if size actually changed and we haven't scratched yet
      if (!isScratched && canvas.offsetWidth > 0 && canvas.width !== canvas.offsetWidth) {
        initCanvas();
      }
    });
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [isScratched]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions based on display size with standard fallback
    const w = canvas.offsetWidth || 260;
    const h = canvas.offsetHeight || 150;
    
    canvas.width = w;
    canvas.height = h;

    // Draw background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#cbd5e1"); // Slate 300
    grad.addColorStop(0.5, "#94a3b8"); // Slate 400
    grad.addColorStop(1, "#64748b"); // Slate 550
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Add gold glitter spots for premium feeling
    ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
    for (let i = 0; i < 35; i++) {
      ctx.beginPath();
      ctx.arc(
        Math.random() * w,
        Math.random() * h,
        Math.random() * 3 + 1,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Add text on scratch card
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SCRATCH CARD HERE", w / 2, h / 2 - 10);
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillText("Reveal your festival gift 🎁", w / 2, h / 2 + 12);

    setIsScratched(false);
    setScratchProgress(0);
    setGameState("scratch");
  };

  // Get coordinates relative to canvas
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Check if touch event
    if ("touches" in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      // Support client coordinates relative to bounding box
      return {
        x: (e.clientX || (e.nativeEvent as MouseEvent).clientX) - rect.left,
        y: (e.clientY || (e.nativeEvent as MouseEvent).clientY) - rect.top,
      };
    }
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isScratched) return;
    
    // Auto-fix if canvas was initialized to 0 height in hidden state
    const canvas = canvasRef.current;
    if (canvas && (canvas.width === 0 || canvas.height === 0 || canvas.width !== canvas.offsetWidth)) {
      initCanvas();
    }
    
    setIsDrawing(true);
    const coords = getCoords(e);
    scratch(coords.x, coords.y);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || isScratched) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const coords = getCoords(e);
    scratch(coords.x, coords.y);
    
    // Compute scratch percentage periodically during drag
    if (Math.random() < 0.15) {
      checkScratchPercentage();
    }
  };

  const handleEnd = () => {
    setIsDrawing(false);
    checkScratchPercentage();
  };

  const scratch = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
  };

  const checkScratchPercentage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imgData.data;
      let clearedCount = 0;

      for (let i = 3; i < pixels.length; i += 32) {
        if (pixels[i] === 0) {
          clearedCount++;
        }
      }

      const totalSampled = pixels.length / 32;
      const ratio = clearedCount / totalSampled;
      const progress = Math.min(100, Math.round(ratio * 100));
      setScratchProgress(progress);

      if (ratio > 0.40 && !isScratched) {
        triggerReveal();
      }
    } catch (e) {
      // Fallback if getImageData fails (e.g. cross-origin issues or security rules)
      console.warn("Canvas data read error, using fallback reveal");
    }
  };

  const triggerReveal = () => {
    setIsScratched(true);
    setScratchProgress(100);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setTimeout(() => {
      setGameState("form");
    }, 1000);
  };

  return (
    <div 
      ref={containerRef}
      className="mx-auto w-[290px] h-[580px] rounded-[2.5rem] border-[11px] border-neutral-900 bg-neutral-950 p-2.5 shadow-2xl relative select-none"
      style={{
        boxShadow: "0 25px 50px -12px rgba(124, 58, 237, 0.25), inset 0 1px 0 0 rgba(255,255,255,0.1)"
      }}
    >
      {/* Speaker and Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-neutral-900 rounded-b-2xl z-20 flex items-center justify-center">
        <div className="h-1 w-12 bg-neutral-800 rounded-full" />
      </div>

      {/* Screen Container */}
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden bg-neutral-50 relative flex flex-col pt-5">
        
        {/* Mock App Header */}
        <div className="px-4 py-3 bg-white border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-neutral-800 tracking-tight">Kalyan Textiles</h4>
            <p className="text-[9px] text-neutral-400">Onam Fest Celebration</p>
          </div>
          <span className="text-[8px] font-semibold bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full border border-violet-100">
            🔥 Live Offer
          </span>
        </div>

        {/* Dynamic States */}
        <div className="flex-1 p-4 flex flex-col justify-between">
          
          {gameState === "scratch" && (
            <div className="flex-1 flex flex-col justify-between py-2">
              <div className="text-center">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100 mb-2">
                  <Sparkles className="h-3 w-3" /> Play &amp; Win
                </span>
                <h5 className="text-base font-extrabold text-neutral-900 tracking-tight leading-tight">
                  You scanned the QR Code!
                </h5>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Scratch the silver card below to reveal your surprise festival reward.
                </p>
              </div>

              {/* Card Container */}
              <div className="relative w-full h-[180px] rounded-2xl overflow-hidden shadow-md my-4 flex items-center justify-center bg-white border border-neutral-100">
                {/* Underlay Reward (Visible once scratched) */}
                <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center bg-gradient-to-br from-violet-50 to-fuchsia-50">
                  <span className="text-2xl mb-1.5">🎉</span>
                  <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">YOU WON</p>
                  <h6 className="text-lg font-black text-neutral-900 leading-tight">15% OFF</h6>
                  <p className="text-[9px] text-neutral-550 mt-0.5 max-w-[150px]">
                    On billing above ₹2,500. Valid for 7 days.
                  </p>
                </div>

                {/* Canvas Overlay */}
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleStart}
                  onMouseMove={handleMove}
                  onMouseUp={handleEnd}
                  onMouseLeave={handleEnd}
                  onTouchStart={handleStart}
                  onTouchMove={handleMove}
                  onTouchEnd={handleEnd}
                  className={`absolute inset-0 w-full h-full cursor-crosshair transition-opacity duration-500 ${
                    isScratched ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                />
              </div>

              <div className="text-center space-y-2">
                <div className="inline-block w-full bg-neutral-200 h-1 rounded-full overflow-hidden mb-1">
                  <div 
                    className="h-full bg-violet-600 transition-all duration-300"
                    style={{ width: `${scratchProgress}%` }}
                  />
                </div>
                <p className="text-[9px] text-neutral-400 font-medium">
                  {scratchProgress}% scratched (Scratch 40% to reveal)
                </p>
                <button
                  onClick={triggerReveal}
                  className="text-[10px] font-bold text-violet-600 hover:text-violet-750 underline cursor-pointer mt-1 block mx-auto"
                >
                  Skip &amp; Reveal Offer
                </button>
              </div>
            </div>
          )}



          {gameState === "form" && (
            <div className="flex-1 flex flex-col justify-between py-2 animate-fadeIn">
              <div className="text-center">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[10px] mb-2 font-bold">
                  ✓
                </span>
                <h5 className="text-sm font-extrabold text-neutral-900">Scratch Complete!</h5>
                <p className="text-[10px] text-neutral-500 mt-0.5">
                  Save your <span className="font-bold text-neutral-800">15% discount coupon</span> in your WhatsApp.
                </p>
              </div>

              {/* Form details showing exact merchant data collection flow */}
              <div className="bg-white p-3 rounded-2xl border border-neutral-100 shadow-sm space-y-2.5 my-3">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Merchant collects:
                </p>
                <div>
                  <label className="block text-[9px] font-bold text-neutral-600 mb-0.5">Your Name</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs focus:bg-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-neutral-600 mb-0.5">WhatsApp Mobile</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="10-digit phone number"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs focus:bg-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <button
                  onClick={() => {
                    if (customerName && customerPhone.length === 10) {
                      setGameState("success");
                    }
                  }}
                  disabled={!customerName || customerPhone.length !== 10}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-600/20 flex items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Get Coupon on WhatsApp <ArrowRight className="h-3 w-3" />
                </button>
                <p className="text-[8px] text-center text-neutral-400 mt-1.5 leading-normal">
                  🔒 By tapping, you consent to receive the digital coupon via automated WhatsApp message.
                </p>
              </div>
            </div>
          )}

          {gameState === "success" && (
            <div className="flex-1 flex flex-col justify-between py-2 text-center animate-fadeIn">
              <div className="my-auto space-y-4">
                <div className="h-12 w-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mx-auto border border-emerald-100">
                  <Check className="h-6 w-6" />
                </div>
                <h5 className="text-base font-extrabold text-neutral-900">Opt-in Completed!</h5>
                
                {/* Simulate WhatsApp Message bubble */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-left max-w-[240px] mx-auto shadow-sm relative">
                  <div className="absolute -left-2 top-3 w-3 h-3 bg-emerald-50 border-l border-b border-emerald-100 rotate-45" />
                  <p className="text-[10px] text-neutral-800 leading-relaxed font-medium">
                    🏪 *Kalyan Textiles*<br/>
                    Hi {customerName}, here is your coupon code:<br/>
                    🏷️ *KALYAN15ONAM*<br/>
                    Show this at counter for *15% OFF* on billing above ₹2500.<br/>
                    👋 _Thanks for shopping with us!_
                  </p>
                  <span className="block text-[8px] text-neutral-400 text-right mt-1">12:45 PM · Read ✓✓</span>
                </div>

                <div className="bg-white p-3 rounded-2xl border border-neutral-100 max-w-[240px] mx-auto text-left">
                  <p className="text-[9px] font-bold text-violet-600 uppercase tracking-wider">DATABASE UPDATE</p>
                  <p className="text-[10px] text-neutral-600 mt-0.5">
                    Customer &ldquo;{customerName}&rdquo; (+91 {customerPhone}) saved to database!
                  </p>
                </div>
              </div>

              <div>
                <button
                  onClick={initCanvas}
                  className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-neutral-200 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" /> Reset Simulator
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Home indicator */}
        <div className="py-2.5 bg-white flex justify-center">
          <div className="h-1 w-24 bg-neutral-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}
