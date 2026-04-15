// app/api/products/location-based/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Inventory from "@/models/Inventory";
import Warehouse from "@/models/warehouseModels";
import { getTokenFromHeader, verifyJWT } from "@/lib/auth";
import mongoose from "mongoose";

// Haversine formula to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function GET(req) {
  try {
    await dbConnect();
    
    const { searchParams } = new URL(req.url);
    const userLat = parseFloat(searchParams.get("lat"));
    const userLng = parseFloat(searchParams.get("lng"));
    const userCity = searchParams.get("city");
    
    console.log("Received params:", { userLat, userLng, userCity });
    
    // Get companyId from token
    let companyId = null;
    
    try {
      const token = getTokenFromHeader(req);
      console.log("Token exists:", !!token);
      
      if (token) {
        const decoded = verifyJWT(token);
        companyId = decoded?.companyId;
        console.log("CompanyId from token:", companyId);
      }
    } catch (err) {
      console.error("Auth error:", err.message);
    }
    
    // If no companyId from token, try to get from first warehouse
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      const firstWarehouse = await Warehouse.findOne();
      if (firstWarehouse && firstWarehouse.companyId) {
        companyId = firstWarehouse.companyId;
        console.log("Using companyId from first warehouse:", companyId);
      } else {
        return NextResponse.json({ 
          success: true, 
          data: [], 
          message: "No company configured",
          nearestWarehouse: null,
          companyId: null
        });
      }
    }
    
    // Validate companyId
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      console.error("Invalid companyId:", companyId);
      return NextResponse.json({ 
        success: true, 
        data: [], 
        message: "Invalid company ID",
        nearestWarehouse: null,
        companyId: null
      });
    }
    
    // Get all warehouses for the company
    let warehouses = [];
    try {
      warehouses = await Warehouse.find({ companyId: new mongoose.Types.ObjectId(companyId) }).lean();
      console.log(`Found ${warehouses.length} warehouses`);
    } catch (err) {
      console.error("Warehouse fetch error:", err);
      return NextResponse.json({ 
        success: true, 
        data: [], 
        message: "Error fetching warehouses",
        nearestWarehouse: null,
        companyId: null
      });
    }
    
    if (warehouses.length === 0) {
      return NextResponse.json({ 
        success: true, 
        data: [], 
        message: "No warehouses found",
        nearestWarehouse: null,
        companyId: null
      });
    }
    
    // Calculate distances for all warehouses with valid coordinates
    let warehousesWithDistance = warehouses.map(warehouse => {
      let distance = null;
      if (userLat && userLng && !isNaN(userLat) && !isNaN(userLng)) {
        if (warehouse.location && warehouse.location.coordinates && warehouse.location.coordinates.length === 2) {
          const [whLng, whLat] = warehouse.location.coordinates;
          if (whLat && whLng && whLat !== 0 && whLng !== 0) {
            distance = calculateDistance(userLat, userLng, whLat, whLng);
          }
        }
      }
      return { ...warehouse, distance };
    });
    
    // Filter warehouses with valid distance
    const warehousesWithValidDistance = warehousesWithDistance.filter(w => 
      w.distance !== null && !isNaN(w.distance)
    );
    
    // Find the single nearest warehouse
    let nearestWarehouse = null;
    
    if (warehousesWithValidDistance.length > 0) {
      warehousesWithValidDistance.sort((a, b) => a.distance - b.distance);
      nearestWarehouse = warehousesWithValidDistance[0];
      console.log("Nearest warehouse found:", {
        name: nearestWarehouse.warehouseName,
        city: nearestWarehouse.city,
        distance: nearestWarehouse.distance
      });
    } else {
      nearestWarehouse = warehouses[0];
      console.log("No coordinates, using first warehouse:", nearestWarehouse.warehouseName);
    }
    
    // Use only the nearest warehouse ID
    const warehouseId = nearestWarehouse._id;
    
    console.log("Using ONLY nearest warehouse:", nearestWarehouse.warehouseName);
    
    // Get inventory only from the nearest warehouse
    let inventoryItems = [];
    try {
      inventoryItems = await Inventory.find({
        companyId: new mongoose.Types.ObjectId(companyId),
        warehouse: warehouseId,
        quantity: { $gt: 0 }
      })
      .populate({
        path: "item",
        match: { status: "active" },
        select: "itemName itemCode unitPrice description imageUrl status category uom variants enableVariants itemType"
      })
      .populate("warehouse", "warehouseName warehouseCode city location")
      .lean();
      
      console.log(`Found ${inventoryItems.length} inventory items from nearest warehouse: ${nearestWarehouse.warehouseName}`);
    } catch (err) {
      console.error("Inventory fetch error:", err);
      inventoryItems = [];
    }
    
    // Filter out items where item is null
    const availableProducts = inventoryItems.filter(inv => inv.item);
    
    // Group by item
    const productMap = new Map();
    
    availableProducts.forEach(inv => {
      const itemId = inv.item._id.toString();
      
      if (!productMap.has(itemId)) {
        productMap.set(itemId, {
          _id: inv.item._id,
          itemName: inv.item.itemName,
          itemCode: inv.item.itemCode,
          unitPrice: inv.item.unitPrice,
          description: inv.item.description,
          imageUrl: inv.item.imageUrl,
          status: inv.item.status,
          category: inv.item.category,
          uom: inv.item.uom,
          variants: inv.item.variants || [],
          enableVariants: inv.item.enableVariants || false,
          itemType: inv.item.itemType,
          totalStock: 0,
          warehouse: {
            warehouseId: inv.warehouse._id,
            warehouseName: inv.warehouse.warehouseName,
            city: inv.warehouse.city,
            distance: nearestWarehouse.distance
          }
        });
      }
      
      const product = productMap.get(itemId);
      product.totalStock += inv.quantity;
    });
    
    const products = Array.from(productMap.values());
    
    // ✅ IMPORTANT: Return the ACTUAL companyId, not warehouse ID
    return NextResponse.json({
      success: true,
      data: products,
      userLocation: { lat: userLat, lng: userLng, city: userCity || "Unknown" },
      nearestWarehouse: {
        id: nearestWarehouse._id,
        name: nearestWarehouse.warehouseName,
        city: nearestWarehouse.city,
        companyId: companyId, // ✅ Return actual company ID
        distance: nearestWarehouse.distance ? `${nearestWarehouse.distance.toFixed(1)} km` : null
      },
      companyId: companyId, // ✅ Return actual company ID at root level
      totalProducts: products.length
    });
    
  } catch (error) {
    console.error("Location-based products error:", error);
    return NextResponse.json({ 
      success: true, 
      data: [], 
      message: error.message,
      nearestWarehouse: null,
      companyId: null
    });
  }
}