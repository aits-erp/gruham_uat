import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Item from "@/models/ItemModels";
import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// ✅ Role-based access for item management
function isAuthorized(user) {
  if (!user) return false;

  if (user.type === "company") return true;

  const allowedRoles = [
    "admin",
    "sales manager",
    "purchase manager",
    "inventory manager",
    "accounts manager",
    "hr manager",
    "support executive",
    "production head",
    "project manager",
  ];

  const userRoles = Array.isArray(user.roles)
    ? user.roles
    : [];

  return userRoles.some(role =>
    allowedRoles.includes(role.trim().toLowerCase())
  );
}

// ✅ Validate user token & permissions
async function validateUser(req) {
  const token = getTokenFromHeader(req);
  if (!token) return { error: "Token missing", status: 401 };

  try {
    const user = await verifyJWT(token);
    if (!user || !isAuthorized(user)) return { error: "Unauthorized", status: 403 };
    return { user };
  } catch (err) {
    console.error("JWT Verification Failed:", err.message);
    return { error: "Invalid token", status: 401 };
  }
}

/* ========================================
   📥 GET /api/items - PUBLIC ACCESS
   Anyone can view items (customers, guests, etc.)
======================================== */
export async function GET(req) {
  await dbConnect();

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const posOnly = searchParams.get("posOnly") === "true";
    
    // Build query for public access
    const query = { 
      status: "active"  // Only show active items
    };
    
    // Only show POS-enabled items if requested
    if (posOnly) {
      query.posEnabled = true;
    }
    
    // Filter by category if specified
    if (category) {
      query.category = category;
    }
    
    const items = await Item.find(query)
    .select('_id itemName unitPrice imageUrl description category uom variants enableVariants companyId')
    .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: items }, { status: 200 });
  } catch (err) {
    console.error("GET /api/items error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to fetch items" },
      { status: 500 }
    );
  }
}

/* ========================================
   ✏️ POST /api/items - PROTECTED
   Only authenticated users can create items
======================================== */
export async function POST(req) {
  await dbConnect();
  
  // Check authentication for write operations
  const token = getTokenFromHeader(req);
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const user = await verifyJWT(token);
    if (!user || !isAuthorized(user)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 403 }
      );
    }

    const data = await req.json();

    // ✅ Validate required fields
    const requiredFields = ["itemCode", "itemName", "category", ];
    for (let field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json(
          { success: false, message: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // ✅ Prevent duplicate itemCode within the company
    const existingItem = await Item.findOne({
      itemCode: data.itemCode,
      companyId: user.companyId,
    });
    if (existingItem) {
      return NextResponse.json(
        { success: false, message: "Item Code already exists" },
        { status: 400 }
      );
    }

    // ✅ Save item
    const item = new Item({
      ...data,
      companyId: user.companyId,
      createdBy: user.id,
    });

    await item.save();
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (err) {
    console.error("POST /api/items error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to create item" },
      { status: 500 }
    );
  }
}

/* ========================================
   🔄 PUT /api/items - PROTECTED
======================================== */
export async function PUT(req) {
  await dbConnect();
  
  const token = getTokenFromHeader(req);
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const user = await verifyJWT(token);
    if (!user || !isAuthorized(user)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Item ID is required" },
        { status: 400 }
      );
    }

    const data = await req.json();
    
    // Find and update item
    const item = await Item.findOneAndUpdate(
      { _id: id, companyId: user.companyId },
      { $set: data },
      { new: true, runValidators: true }
    );
    
    if (!item) {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: item });
  } catch (err) {
    console.error("PUT /api/items error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update item" },
      { status: 500 }
    );
  }
}

/* ========================================
   🗑️ DELETE /api/items - PROTECTED
======================================== */
export async function DELETE(req) {
  await dbConnect();
  
  const token = getTokenFromHeader(req);
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const user = await verifyJWT(token);
    if (!user || !isAuthorized(user)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Item ID is required" },
        { status: 400 }
      );
    }
    
    // Find and delete item
    const item = await Item.findOneAndDelete({
      _id: id,
      companyId: user.companyId
    });
    
    if (!item) {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, message: "Item deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/items error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete item" },
      { status: 500 }
    );
  }
}




// import { NextResponse } from "next/server";
// import dbConnect from "@/lib/db";
// import Item from "@/models/ItemModels";
// import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// // ✅ Role-based access for item management
// function isAuthorized(user) {
//   if (!user) return false;

//   if (user.type === "company") return true;

//   const allowedRoles = [
//     "admin",
//     "sales manager",
//     "purchase manager",
//     "inventory manager",
//     "accounts manager",
//     "hr manager",
//     "support executive",
//     "production head",
//     "project manager",
//   ];

//   const userRoles = Array.isArray(user.roles)
//     ? user.roles
//     : [];

//   return userRoles.some(role =>
//     allowedRoles.includes(role.trim().toLowerCase())
//   );
// }

// // ✅ Validate user token & permissions
// async function validateUser(req) {
//   const token = getTokenFromHeader(req);
//   if (!token) return { error: "Token missing", status: 401 };

//   try {
//     const user = await verifyJWT(token);
//     if (!user || !isAuthorized(user)) return { error: "Unauthorized", status: 403 };
//     return { user };
//   } catch (err) {
//     console.error("JWT Verification Failed:", err.message);
//     return { error: "Invalid token", status: 401 };
//   }
// }

// /* ========================================
//    📥 GET /api/items - PUBLIC ACCESS
//    Anyone can view items (customers, guests, etc.)
// ======================================== */
// export async function GET(req) {
//   await dbConnect();

//   try {
//     const { searchParams } = new URL(req.url);
//     const category = searchParams.get("category");
//     const posOnly = searchParams.get("posOnly") === "true";
    
//     // Build query for public access
//     const query = { 
//       status: "active"  // Only show active items
//     };
    
//     // Only show POS-enabled items if requested
//     if (posOnly) {
//       query.posEnabled = true;
//     }
    
//     // Filter by category if specified
//     if (category) {
//       query.category = category;
//     }
    
//     const items = await Item.find(query).sort({ createdAt: -1 });

//     return NextResponse.json({ success: true, data: items }, { status: 200 });
//   } catch (err) {
//     console.error("GET /api/items error:", err);
//     return NextResponse.json(
//       { success: false, message: "Failed to fetch items" },
//       { status: 500 }
//     );
//   }
// }

// /* ========================================
//    ✏️ POST /api/items - PROTECTED
//    Only authenticated users can create items
// ======================================== */
// export async function POST(req) {
//   await dbConnect();
  
//   // Check authentication for write operations
//   const token = getTokenFromHeader(req);
//   if (!token) {
//     return NextResponse.json(
//       { success: false, message: "Authentication required" },
//       { status: 401 }
//     );
//   }

//   try {
//     const user = await verifyJWT(token);
//     if (!user || !isAuthorized(user)) {
//       return NextResponse.json(
//         { success: false, message: "Unauthorized" },
//         { status: 403 }
//       );
//     }

//     const data = await req.json();

//     // ✅ Validate required fields
//     const requiredFields = ["itemCode", "itemName", "category", ];
//     for (let field of requiredFields) {
//       if (!data[field]) {
//         return NextResponse.json(
//           { success: false, message: `${field} is required` },
//           { status: 400 }
//         );
//       }
//     }

//     // ✅ Prevent duplicate itemCode within the company
//     const existingItem = await Item.findOne({
//       itemCode: data.itemCode,
//       companyId: user.companyId,
//     });
//     if (existingItem) {
//       return NextResponse.json(
//         { success: false, message: "Item Code already exists" },
//         { status: 400 }
//       );
//     }

//     // ✅ Save item
//     const item = new Item({
//       ...data,
//       companyId: user.companyId,
//       createdBy: user.id,
//     });

//     await item.save();
//     return NextResponse.json({ success: true, data: item }, { status: 201 });
//   } catch (err) {
//     console.error("POST /api/items error:", err);
//     return NextResponse.json(
//       { success: false, message: "Failed to create item" },
//       { status: 500 }
//     );
//   }
// }

// /* ========================================
//    🔄 PUT /api/items - PROTECTED
// ======================================== */
// export async function PUT(req) {
//   await dbConnect();
  
//   const token = getTokenFromHeader(req);
//   if (!token) {
//     return NextResponse.json(
//       { success: false, message: "Authentication required" },
//       { status: 401 }
//     );
//   }

//   try {
//     const user = await verifyJWT(token);
//     if (!user || !isAuthorized(user)) {
//       return NextResponse.json(
//         { success: false, message: "Unauthorized" },
//         { status: 403 }
//       );
//     }

//     const { searchParams } = new URL(req.url);
//     const id = searchParams.get("id");
    
//     if (!id) {
//       return NextResponse.json(
//         { success: false, message: "Item ID is required" },
//         { status: 400 }
//       );
//     }

//     const data = await req.json();
    
//     // Find and update item
//     const item = await Item.findOneAndUpdate(
//       { _id: id, companyId: user.companyId },
//       { $set: data },
//       { new: true, runValidators: true }
//     );
    
//     if (!item) {
//       return NextResponse.json(
//         { success: false, message: "Item not found" },
//         { status: 404 }
//       );
//     }
    
//     return NextResponse.json({ success: true, data: item });
//   } catch (err) {
//     console.error("PUT /api/items error:", err);
//     return NextResponse.json(
//       { success: false, message: "Failed to update item" },
//       { status: 500 }
//     );
//   }
// }

// /* ========================================
//    🗑️ DELETE /api/items - PROTECTED
// ======================================== */
// export async function DELETE(req) {
//   await dbConnect();
  
//   const token = getTokenFromHeader(req);
//   if (!token) {
//     return NextResponse.json(
//       { success: false, message: "Authentication required" },
//       { status: 401 }
//     );
//   }

//   try {
//     const user = await verifyJWT(token);
//     if (!user || !isAuthorized(user)) {
//       return NextResponse.json(
//         { success: false, message: "Unauthorized" },
//         { status: 403 }
//       );
//     }

//     const { searchParams } = new URL(req.url);
//     const id = searchParams.get("id");
    
//     if (!id) {
//       return NextResponse.json(
//         { success: false, message: "Item ID is required" },
//         { status: 400 }
//       );
//     }
    
//     // Find and delete item
//     const item = await Item.findOneAndDelete({
//       _id: id,
//       companyId: user.companyId
//     });
    
//     if (!item) {
//       return NextResponse.json(
//         { success: false, message: "Item not found" },
//         { status: 404 }
//       );
//     }
    
//     return NextResponse.json({ success: true, message: "Item deleted successfully" });
//   } catch (err) {
//     console.error("DELETE /api/items error:", err);
//     return NextResponse.json(
//       { success: false, message: "Failed to delete item" },
//       { status: 500 }
//     );
//   }
// }



// import { NextResponse } from "next/server";
// import dbConnect from "@/lib/db";
// import Item from "@/models/ItemModels";
// import { getTokenFromHeader, verifyJWT } from "@/lib/auth";

// // ✅ Role-based access for item management
// function isAuthorized(user) {
//   return user?.type === "company" || user?.role === "Admin" || user?.permissions?.includes("item");
// }

// // ✅ Validate user token & permissions
// async function validateUser(req) {
//   const token = getTokenFromHeader(req);
//   if (!token) return { error: "Token missing", status: 401 };

//   try {
//     const user = await verifyJWT(token);
//     if (!user || !isAuthorized(user)) return { error: "Unauthorized", status: 403 };
//     return { user };
//   } catch (err) {
//     console.error("JWT Verification Failed:", err.message);
//     return { error: "Invalid token", status: 401 };
//   }
// }

// /* ========================================
//    📥 GET /api/item
// ======================================== */
// export async function GET(req) {
//   await dbConnect();
//   const { user, error, status } = await validateUser(req);
//   if (error) return NextResponse.json({ success: false, message: error }, { status });

//   try {
//     const items = await Item.find({ companyId: user.companyId }).sort({ createdAt: -1 });
//     return NextResponse.json({ success: true, data: items }, { status: 200 });
//   } catch (err) {
//     console.error("GET /item error:", err);
//     return NextResponse.json({ success: false, message: "Failed to fetch items" }, { status: 500 });
//   }
// }

// /* ========================================
//    ✏️ POST /api/item
// ======================================== */
// export async function POST(req) {
//   await dbConnect();
//   const { user, error, status } = await validateUser(req);
//   if (error) return NextResponse.json({ success: false, message: error }, { status });

//   try {
//     const data = await req.json();

//     // ✅ Validate required fields
//     const requiredFields = ["itemCode", "itemName", "category", "unitPrice", "quantity"];
//     for (let field of requiredFields) {
//       if (!data[field]) {
//         return NextResponse.json({ success: false, message: `${field} is required` }, { status: 400 });
//       }
//     }

//     // ✅ Prevent duplicate itemCode within the company
//     const existingItem = await Item.findOne({ itemCode: data.itemCode, companyId: user.companyId });
//     if (existingItem) {
//       return NextResponse.json({ success: false, message: "Item Code already exists" }, { status: 400 });
//     }

//     // ✅ Save item
//     const item = new Item({
//       ...data,
//       companyId: user.companyId,
//       createdBy: user.id,
//     });

//     await item.save();
//     return NextResponse.json({ success: true, data: item }, { status: 201 });
//   } catch (err) {
//     console.error("POST /item error:", err);
//     return NextResponse.json({ success: false, message: "Failed to create item" }, { status: 500 });
//   }
// }


