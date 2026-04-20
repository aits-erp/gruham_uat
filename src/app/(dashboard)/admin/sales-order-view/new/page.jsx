"use client";

import { useState, useEffect, Suspense, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import ItemSection from "@/components/ItemSection";
import CustomerSearch from "@/components/CustomerSearch";
import CustomerAddressSelector from "@/components/CustomerAddressSelector";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { jwtDecode } from "jwt-decode";
import {
  FaArrowLeft, FaCheck, FaUser, FaCalendarAlt,
  FaBoxOpen, FaCalculator, FaPaperclip, FaTimes, FaSpinner
} from "react-icons/fa";

// ============================================================
// HELPERS & SUB-COMPONENTS
// ============================================================
function formatDateForInput(date) {
  if (!date) return "";
  const d = new Date(date);
  return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
}

const initialState = {
  customerCode: "", customerName: "", contactPerson: "", refNumber: "",
  salesEmployee: "", status: "Open",
  orderDate: formatDateForInput(new Date()), expectedDeliveryDate: "",
  billingAddress: null, shippingAddress: null,
  items: [{
    item: "", itemCode: "", itemId: "", itemName: "", itemDescription: "",
    quantity: 0, unitPrice: 0, discount: 0, freight: 0, uom: "",
    taxOption: "GST", priceAfterDiscount: 0, totalAmount: 0,
    gstAmount: 0, gstRate: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
    warehouse: "", warehouseName: "", warehouseCode: "", warehouseId: "",
    managedByBatch: true,
    variantId: null,
    variantName: null,
    enableVariants: false,
    variants: [],
  }],
  remarks: "", freight: 0, rounding: 0, totalDownPayment: 0, appliedAmounts: 0,
  totalBeforeDiscount: 0, gstTotal: 0, grandTotal: 0, openBalance: 0,
  attachments: [],
};

const round = (num, d = 2) => { const n = Number(num); return isNaN(n) ? 0 : Number(n.toFixed(d)); };

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const computeItemValues = (item) => {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unitPrice) || 0;
  const disc = parseFloat(item.discount) || 0;
  const fr = parseFloat(item.freight) || 0;
  const pad = round(price - disc);
  const total = round(qty * pad + fr);
  if (item.taxOption === "GST") {
    const gstRate = parseFloat(item.gstRate) || 0;
    const cgst = round(total * (gstRate / 200));
    return { priceAfterDiscount: pad, totalAmount: total, gstAmount: cgst * 2, cgstAmount: cgst, sgstAmount: cgst, igstAmount: 0 };
  }
  const igst = round(total * ((parseFloat(item.gstRate) || 0) / 100));
  return { priceAfterDiscount: pad, totalAmount: total, gstAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: igst };
};

const Lbl = ({ text, req }) => (
  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
    {text}{req && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const fi = (readOnly = false) =>
  `w-full px-3 py-2.5 rounded-lg border text-sm font-medium transition-all outline-none
   ${readOnly ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300"}`;

const SectionCard = ({ icon: Icon, title, subtitle, children, color = "indigo" }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
    <div className={`flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-${color}-50/40`}>
      <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center text-${color}-500`}><Icon className="text-sm" /></div>
      <div><p className="text-sm font-bold text-gray-900">{title}</p>{subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}</div>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function SalesOrderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading Order Form...</div>}>
      <SalesOrderForm />
    </Suspense>
  );
}

function SalesOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("editId");

  const [formData, setFormData]           = useState(initialState);
  const [attachments, setAttachments]     = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [removedFiles, setRemovedFiles]   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isAdmin, setIsAdmin]             = useState(false);
  const [isCopied, setIsCopied]           = useState(false);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [enriching, setEnriching]         = useState(false);

  const stableInitial = useMemo(() => initialState, []);
  const isReadOnly = !!editId && !isAdmin && formData.status === "Closed";

  // Auth & Roles
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const d = jwtDecode(token);
      const roles = Array.isArray(d?.roles) ? d.roles : [];
      setIsAdmin(roles.includes("admin") || roles.includes("sales manager") || d?.type === "company");
    } catch (e) { console.error(e); }
  }, []);

  // Helper: enrich items with full variant data from item master
  const enrichItemsWithVariants = useCallback(async (items, token) => {
    const enrichedItems = [];
    for (const item of items) {
      if (!item.item) {
        enrichedItems.push({ ...item, enableVariants: false, variants: [] });
        continue;
      }
      try {
        const res = await axios.get(`/api/items/${item.item}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const itemMaster = res.data.data;
        console.log(`Item ${item.itemName} master:`, itemMaster);
        const hasVariants = itemMaster.enableVariants === true && Array.isArray(itemMaster.variants) && itemMaster.variants.length > 0;
        enrichedItems.push({
          ...item,
          enableVariants: hasVariants,
          variants: hasVariants ? itemMaster.variants : [],
          variantId: item.variantId || null,
          variantName: item.variantName || null,
        });
      } catch (err) {
        console.error(`Failed to fetch item master for ${item.item}`, err);
        enrichedItems.push({
          ...item,
          enableVariants: false,
          variants: [],
        });
      }
    }
    return enrichedItems;
  }, []);

  // Load from sessionStorage (copy from Quotation or other source)
  useEffect(() => {
    const stored = sessionStorage.getItem("salesOrderData");
    if (stored && !editId) {
      const loadCopiedData = async () => {
        setEnriching(true);
        try {
          const parsed = JSON.parse(stored);
          const token = localStorage.getItem("token");
          const enrichedItems = await enrichItemsWithVariants(parsed.items, token);
          const itemsWithComputed = enrichedItems.map(item => ({
            ...item,
            ...computeItemValues(item)
          }));
          setFormData({
            ...stableInitial,
            ...parsed,
            items: itemsWithComputed,
            orderDate: formatDateForInput(new Date()),
            expectedDeliveryDate: "",
          });
          if (parsed.customerCode || parsed.customerName) {
            setSelectedCustomer({ _id: parsed.customer, customerCode: parsed.customerCode, customerName: parsed.customerName, contactPersonName: parsed.contactPerson });
          }
          setExistingFiles(parsed.attachments || []);
          setIsCopied(true);
          sessionStorage.removeItem("salesOrderData");
          toast.success("Data copied successfully");
        } catch (err) {
          console.error(err);
          toast.error("Failed to load copied data");
        } finally {
          setEnriching(false);
        }
      };
      loadCopiedData();
    }
  }, [editId, stableInitial, enrichItemsWithVariants]);

  // Fetch for Edit (with variant enrichment)
  useEffect(() => {
    if (editId && /^[0-9a-fA-F]{24}$/.test(editId)) {
      setLoading(true);
      const token = localStorage.getItem("token");
      axios.get(`/api/sales-order/${editId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          const record = res.data.data;
          const baseItems = Array.isArray(record.items)
            ? record.items.map(i => ({
                ...stableInitial.items[0],
                ...i,
                item: i.item?._id || i.item || "",
                warehouse: i.warehouse?._id || i.warehouse || "",
                taxOption: i.taxOption || "GST",
                variantId: i.variantId || null,
                variantName: i.variantName || null,
              }))
            : [...stableInitial.items];
          
          setEnriching(true);
          const enrichedItems = await enrichItemsWithVariants(baseItems, token);
          const itemsWithComputed = enrichedItems.map(item => ({
            ...item,
            ...computeItemValues(item)
          }));

          setFormData({
            ...stableInitial,
            ...record,
            items: itemsWithComputed,
            orderDate: formatDate(record.orderDate),
            expectedDeliveryDate: formatDate(record.expectedDeliveryDate)
          });
          
          if (record.customerCode || record.customerName) {
            setSelectedCustomer({ _id: record.customer, customerCode: record.customerCode, customerName: record.customerName, contactPersonName: record.contactPerson });
          }
          setExistingFiles((record.attachments || []).map(f => ({ fileUrl: f.fileUrl || f.url, fileName: f.fileName || "Attachment" })));
          setEnriching(false);
        })
        .catch(err => {
          toast.error("Failed to load data");
          console.error(err);
          setEnriching(false);
        })
        .finally(() => setLoading(false));
    }
  }, [editId, stableInitial, enrichItemsWithVariants]);

  // Financial Calculations
  useEffect(() => {
    const items = Array.isArray(formData.items) ? formData.items : [];
    const totalBeforeDiscount = items.reduce((s, i) => s + (Number(i.unitPrice) * Number(i.quantity) - Number(i.discount)), 0);
    const gstTotal = items.reduce((s, i) => s + (Number(i.gstAmount) || 0), 0);
    const grandTotal = totalBeforeDiscount + gstTotal + Number(formData.freight) + Number(formData.rounding);
    const openBalance = grandTotal - (Number(formData.totalDownPayment) + Number(formData.appliedAmounts));
    
    setFormData(prev => {
        if (prev.grandTotal === round(grandTotal) && prev.totalBeforeDiscount === round(totalBeforeDiscount)) return prev;
        return { ...prev, totalBeforeDiscount: round(totalBeforeDiscount), gstTotal: round(gstTotal), grandTotal: round(grandTotal), openBalance: round(openBalance) };
    });
  }, [formData.items, formData.freight, formData.rounding, formData.totalDownPayment, formData.appliedAmounts]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemSelect = useCallback(async (index, selectedItem) => {
    setFormData(prev => {
      const items = [...prev.items];
      items[index] = {
        ...items[index],
        item: selectedItem._id,
        itemCode: selectedItem.itemCode,
        itemName: selectedItem.itemName,
        itemDescription: selectedItem.description,
        managedByBatch: selectedItem.managedBy === 'batch',
        enableVariants: selectedItem.enableVariants || false,
        variants: selectedItem.variants || [],
        variantId: null,
        variantName: null,
        unitPrice: selectedItem.unitPrice || 0,
      };
      items[index] = { ...items[index], ...computeItemValues(items[index]) };
      return { ...prev, items };
    });
  }, []);

  const handleVariantChange = useCallback((itemIndex, variantId, variantName) => {
    setFormData(prev => {
      const items = [...prev.items];
      const item = items[itemIndex];
      const variant = item.variants?.find(v => v.id === variantId);
      items[itemIndex] = {
        ...item,
        variantId: variantId !== null ? Number(variantId) : null,
        variantName: variantName || null,
        unitPrice: variant?.price ?? item.unitPrice,
      };
      items[itemIndex] = { ...items[itemIndex], ...computeItemValues(items[itemIndex]) };
      return { ...prev, items };
    });
  }, []);

  const handleItemChange = (index, e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [name]: value, ...computeItemValues({ ...items[index], [name]: value }) };
      return { ...prev, items };
    });
  };

  const addItemRow = () => setFormData(p => ({ ...p, items: [...p.items, { ...stableInitial.items[0] }] }));
  const removeItemRow = (i) => setFormData(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const validateForm = () => {
    if (!formData.customerName || !formData.customerCode) {
      toast.error("Please select a valid customer.");
      return false;
    }
    if (!formData.orderDate) {
      toast.error("Order date is required.");
      return false;
    }
    if (formData.items.length === 0) {
      toast.error("At least one item is required.");
      return false;
    }
    for (let i = 0; i < formData.items.length; i++) {
      const item = formData.items[i];
      if (!item.item) { toast.error(`Item missing in row ${i + 1}`); return false; }
      if (!item.warehouse) { toast.error(`Warehouse missing in row ${i + 1}`); return false; }
      if (Number(item.quantity) <= 0) { toast.error(`Quantity must be > 0 in row ${i + 1}`); return false; }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const normalizedItems = formData.items.map(i => ({
        ...i,
        item: typeof i.item === "object" ? i.item._id : i.item,
        warehouse: typeof i.warehouse === "object" ? i.warehouse._id : i.warehouse,
      }));
      const fd = new FormData();
      fd.append("orderData", JSON.stringify({ ...formData, items: normalizedItems, removedFiles }));
      attachments.forEach(file => fd.append("newFiles", file));
      
      const config = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } };
      const res = editId
        ? await axios.put(`/api/sales-order/${editId}`, fd, config)
        : await axios.post("/api/sales-order", fd, config);

      if (res.data.success) {
        toast.success(editId ? "Updated" : "Created");
        router.push("/admin/sales-order-view");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Error saving order");
    } finally { setSubmitting(false); }
  };

  const renderNewFilesPreview = () => attachments.length > 0 && (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-3">
      {attachments.map((file, idx) => {
        if (!(file instanceof File)) return null;
        const url = URL.createObjectURL(file);
        return (
          <div key={idx} className="relative border rounded p-2 text-center bg-slate-100">
            {file.type === "application/pdf"
              ? <div className="h-24 flex items-center justify-center text-[10px] font-bold text-gray-500">PDF File</div>
              : <img src={url} alt={file.name} className="h-24 w-full object-cover rounded" />}
            <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs">×</button>
          </div>
        );
      })}
    </div>
  );

  if (loading || enriching) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <FaSpinner className="animate-spin text-4xl text-indigo-600 mb-4" />
      <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">Loading order data...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        <button onClick={() => router.push("/admin/sales-order-view")}
          className="flex items-center gap-1.5 text-indigo-600 font-semibold text-sm mb-4">
          <FaArrowLeft className="text-xs" /> Back to List
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-gray-900">{editId ? "Edit Sales Order" : "New Sales Order"}</h1>
        </div>

        {/* Customer Section - Search fully functional */}
        <SectionCard icon={FaUser} title="Customer Details" color="indigo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Lbl text="Customer Name" req />
              {/* When editing or copying, we show a plain input; otherwise show search + add new button */}
              {(editId || isCopied) ? (
                <input className={fi(isReadOnly)} name="customerName" value={formData.customerName || ""} onChange={handleChange} readOnly={isReadOnly} />
              ) : isNewCustomer ? (
                <div className="space-y-2">
                  <input className={fi()} name="customerName" value={formData.customerName || ""} onChange={handleChange} placeholder="Enter New Customer Name" />
                  <button type="button" onClick={() => setIsNewCustomer(false)} className="text-[10px] font-bold text-gray-400 uppercase">⬅ Search existing customer</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <CustomerSearch onSelectCustomer={(c) => {
                    setSelectedCustomer(c);
                    setFormData(p => ({ ...p, customer: c._id, customerName: c.customerName, customerCode: c.customerCode, contactPerson: c.contactPersonName }));
                  }} />
                  <button type="button" onClick={() => setIsNewCustomer(true)} className="text-[10px] font-bold text-indigo-600 uppercase">+ Add new customer</button>
                </div>
              )}
            </div>
            <div><Lbl text="Customer Code" /><input className={fi(true)} value={formData.customerCode} readOnly /></div>
            <div><Lbl text="Contact Person" /><input className={fi(true)} value={formData.contactPerson} readOnly /></div>
            <div><Lbl text="Reference No." /><input className={fi(isReadOnly)} name="refNumber" value={formData.refNumber || ""} onChange={handleChange} placeholder="REF-001" readOnly={isReadOnly} /></div>
          </div>
        </SectionCard>

        {/* Address Selection */}
        <div className="mb-5">
          <CustomerAddressSelector
            customer={selectedCustomer}
            selectedBillingAddress={formData.billingAddress}
            selectedShippingAddress={formData.shippingAddress}
            onBillingAddressSelect={(a) => setFormData(p => ({ ...p, billingAddress: a }))}
            onShippingAddressSelect={(a) => setFormData(p => ({ ...p, shippingAddress: a }))}
          />
        </div>

        {/* Scheduling Section */}
        <SectionCard icon={FaCalendarAlt} title="Order Scheduling" color="blue">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><Lbl text="Order Date" req /><input type="date" className={fi(isReadOnly)} name="orderDate" value={formData.orderDate || ""} onChange={handleChange} readOnly={isReadOnly} /></div>
            <div><Lbl text="Delivery Date" /><input type="date" className={fi(isReadOnly)} name="expectedDeliveryDate" value={formData.expectedDeliveryDate || ""} onChange={handleChange} readOnly={isReadOnly} /></div>
            <div>
              <Lbl text="Status" />
              <select className={fi(isReadOnly)} name="status" value={formData.status} onChange={handleChange} disabled={isReadOnly}>
                <option>Open</option><option>Pending</option><option>Closed</option><option>Cancelled</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {/* Line Items Section */}
        <div className="bg-white rounded-2xl shadow-sm border mb-5 overflow-hidden">
          <div className="px-6 py-4 border-b bg-emerald-50/40 font-bold">Line Items</div>
          <div className="p-4 overflow-x-auto">
            <ItemSection
              items={formData.items}
              onItemChange={handleItemChange}
              onItemSelect={handleItemSelect}
              onVariantChange={handleVariantChange}
              onAddItem={addItemRow}
              onRemoveItem={removeItemRow}
              computeItemValues={computeItemValues}
              readOnly={isReadOnly}
            />
          </div>
        </div>

        {/* Financial Summary */}
        <SectionCard icon={FaCalculator} title="Financial Summary" color="amber">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><Lbl text="Subtotal" /><input readOnly value={formData.totalBeforeDiscount} className={fi(true)} /></div>
            <div><Lbl text="GST Total" /><input readOnly value={formData.gstTotal} className={fi(true)} /></div>
            <div><Lbl text="Freight" /><input type="number" name="freight" value={formData.freight} onChange={handleChange} className={fi(isReadOnly)} readOnly={isReadOnly} /></div>
            <div><Lbl text="Rounding" /><input type="number" name="rounding" value={formData.rounding} onChange={handleChange} className={fi(isReadOnly)} readOnly={isReadOnly} /></div>
            <div>
              <Lbl text="Grand Total" />
              <div className="px-3 py-2.5 rounded-lg border-2 border-indigo-200 bg-indigo-50 text-indigo-700 font-extrabold">₹ {formData.grandTotal}</div>
            </div>
            <div><Lbl text="Open Balance" /><input readOnly value={formData.openBalance} className={fi(true)} /></div>
          </div>
          <div className="mt-4">
            <Lbl text="Remarks" />
            <textarea name="remarks" value={formData.remarks || ""} onChange={handleChange} rows={2} className={`${fi(isReadOnly)} resize-none`} readOnly={isReadOnly} />
          </div>
        </SectionCard>

        {/* Attachments */}
        <SectionCard icon={FaPaperclip} title="Attachments" color="gray">
          <div className="mb-4">
            {existingFiles.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {existingFiles.map((file, idx) => (
                  <div key={idx} className="relative group border rounded-xl p-2 bg-gray-50">
                    <div className="h-20 flex items-center justify-center overflow-hidden rounded-lg">
                      {file.fileUrl?.toLowerCase().endsWith(".pdf")
                        ? <div className="text-[10px] font-bold">PDF</div>
                        : <img src={file.fileUrl} alt={file.fileName} className="h-full object-cover" />}
                    </div>
                    {!isReadOnly && (
                      <button onClick={() => { setExistingFiles(prev => prev.filter((_, i) => i !== idx)); setRemovedFiles(prev => [...prev, file]); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                        <FaTimes />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {!isReadOnly && (
            <label className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-indigo-50 transition-all">
              <FaPaperclip className="text-gray-300" />
              <span className="text-sm font-medium text-gray-400">Click to upload new files</span>
              <input type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => {
                const files = Array.from(e.target.files);
                setAttachments(prev => [...prev, ...files]);
                e.target.value = "";
              }} />
            </label>
          )}
          {renderNewFilesPreview()}
        </SectionCard>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 pb-10">
          <button onClick={() => router.push("/admin/sales-order-view")} className="px-6 py-2.5 rounded-xl bg-white border font-bold text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting || isReadOnly} className={`px-8 py-2.5 rounded-xl text-white font-bold text-sm ${submitting || isReadOnly ? "bg-gray-300" : "bg-indigo-600 shadow-lg"}`}>
            {submitting ? "Processing..." : editId ? "Update Order" : "Create Order"}
          </button>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

// "use client";

// import { useState, useEffect, Suspense, useMemo } from "react";
// import { useRouter, useSearchParams } from "next/navigation";
// import axios from "axios";
// import ItemSection from "@/components/ItemSection";
// import CustomerSearch from "@/components/CustomerSearch";
// import CustomerAddressSelector from "@/components/CustomerAddressSelector";
// import { toast, ToastContainer } from "react-toastify";
// import "react-toastify/dist/ReactToastify.css";
// import { jwtDecode } from "jwt-decode";
// import {
//   FaArrowLeft, FaCheck, FaUser, FaCalendarAlt,
//   FaBoxOpen, FaCalculator, FaPaperclip, FaTimes
// } from "react-icons/fa";

// // ============================================================
// // HELPERS & SUB-COMPONENTS
// // ============================================================
// function formatDateForInput(date) {
//   if (!date) return "";
//   const d = new Date(date);
//   return isNaN(d.getTime()) ? "" : d.toISOString().split('T')[0];
// }

// const initialState = {
//   customerCode: "", customerName: "", contactPerson: "", refNumber: "",
//   salesEmployee: "", status: "Open",
//   orderDate: formatDateForInput(new Date()), expectedDeliveryDate: "",
//   billingAddress: null, shippingAddress: null,
//   items: [{
//     item: "", itemCode: "", itemId: "", itemName: "", itemDescription: "",
//     quantity: 0, unitPrice: 0, discount: 0, freight: 0, uom: "",
//     taxOption: "GST", priceAfterDiscount: 0, totalAmount: 0,
//     gstAmount: 0, gstRate: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
//     warehouse: "", warehouseName: "", warehouseCode: "", warehouseId: "",
//     managedByBatch: true,
//   }],
//   remarks: "", freight: 0, rounding: 0, totalDownPayment: 0, appliedAmounts: 0,
//   totalBeforeDiscount: 0, gstTotal: 0, grandTotal: 0, openBalance: 0,
//   attachments: [],
// };

// const round = (num, d = 2) => { const n = Number(num); return isNaN(n) ? 0 : Number(n.toFixed(d)); };

// function formatDate(d) {
//   if (!d) return "";
//   const date = new Date(d);
//   return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
// }

// const computeItemValues = (item) => {
//   const qty = parseFloat(item.quantity) || 0;
//   const price = parseFloat(item.unitPrice) || 0;
//   const disc = parseFloat(item.discount) || 0;
//   const fr = parseFloat(item.freight) || 0;
//   const pad = round(price - disc);
//   const total = round(qty * pad + fr);
//   if (item.taxOption === "GST") {
//     const gstRate = parseFloat(item.gstRate) || 0;
//     const cgst = round(total * (gstRate / 200));
//     return { priceAfterDiscount: pad, totalAmount: total, gstAmount: cgst * 2, cgstAmount: cgst, sgstAmount: cgst, igstAmount: 0 };
//   }
//   const igst = round(total * ((parseFloat(item.gstRate) || 0) / 100));
//   return { priceAfterDiscount: pad, totalAmount: total, gstAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: igst };
// };

// const Lbl = ({ text, req }) => (
//   <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
//     {text}{req && <span className="text-red-500 ml-0.5">*</span>}
//   </label>
// );

// const fi = (readOnly = false) =>
//   `w-full px-3 py-2.5 rounded-lg border text-sm font-medium transition-all outline-none
//    ${readOnly ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-gray-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300"}`;

// const SectionCard = ({ icon: Icon, title, subtitle, children, color = "indigo" }) => (
//   <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
//     <div className={`flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-${color}-50/40`}>
//       <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center text-${color}-500`}><Icon className="text-sm" /></div>
//       <div><p className="text-sm font-bold text-gray-900">{title}</p>{subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}</div>
//     </div>
//     <div className="px-6 py-5">{children}</div>
//   </div>
// );

// // ============================================================
// // MAIN PAGE COMPONENT
// // ============================================================

// export default function SalesOrderPage() {
//   return (
//     <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading Order Form...</div>}>
//       <SalesOrderForm />
//     </Suspense>
//   );
// }

// function SalesOrderForm() {
//   const router = useRouter();
//   const params = useSearchParams();
//   const editId = params.get("editId");

//   const [formData, setFormData]           = useState(initialState);
//   const [attachments, setAttachments]     = useState([]);
//   const [existingFiles, setExistingFiles] = useState([]);
//   const [removedFiles, setRemovedFiles]   = useState([]);
//   const [loading, setLoading]             = useState(false);
//   const [submitting, setSubmitting]       = useState(false);
//   const [selectedCustomer, setSelectedCustomer] = useState(null);
//   const [isAdmin, setIsAdmin]             = useState(false);
//   const [isCopied, setIsCopied]           = useState(false);
//   const [isNewCustomer, setIsNewCustomer] = useState(false);

//   const stableInitial = useMemo(() => initialState, []);
//   const isReadOnly = !!editId && !isAdmin && formData.status === "Closed";

//   // Auth & Roles
//   useEffect(() => {
//     const token = localStorage.getItem("token");
//     if (!token) return;
//     try {
//       const d = jwtDecode(token);
//       const roles = Array.isArray(d?.roles) ? d.roles : [];
//       setIsAdmin(roles.includes("admin") || roles.includes("sales manager") || d?.type === "company");
//     } catch (e) { console.error(e); }
//   }, []);

//   // Fetch for Edit
//   useEffect(() => {
//     if (editId && /^[0-9a-fA-F]{24}$/.test(editId)) {
//       setLoading(true);
//       const token = localStorage.getItem("token");
//       axios.get(`/api/sales-order/${editId}`, { headers: { Authorization: `Bearer ${token}` } })
//         .then(res => {
//           const record = res.data.data;
//           const items = Array.isArray(record.items)
//             ? record.items.map(i => ({ ...stableInitial.items[0], ...i, item: i.item?._id || i.item || "", warehouse: i.warehouse?._id || i.warehouse || "", taxOption: i.taxOption || "GST" }))
//             : [...stableInitial.items];
          
//           setFormData({ ...stableInitial, ...record, items, orderDate: formatDate(record.orderDate), expectedDeliveryDate: formatDate(record.expectedDeliveryDate) });
          
//           if (record.customerCode || record.customerName) {
//             setSelectedCustomer({ _id: record.customer, customerCode: record.customerCode, customerName: record.customerName, contactPersonName: record.contactPerson });
//           }
//           setExistingFiles((record.attachments || []).map(f => ({ fileUrl: f.fileUrl || f.url, fileName: f.fileName || "Attachment" })));
//         })
//         .catch(err => toast.error("Failed to load data"))
//         .finally(() => setLoading(false));
//     }
//   }, [editId, stableInitial]);

//   // Financial Calculations
//   useEffect(() => {
//     const items = Array.isArray(formData.items) ? formData.items : [];
//     const totalBeforeDiscount = items.reduce((s, i) => s + (Number(i.unitPrice) * Number(i.quantity) - Number(i.discount)), 0);
//     const gstTotal = items.reduce((s, i) => s + (Number(i.gstAmount) || 0), 0);
//     const grandTotal = totalBeforeDiscount + gstTotal + Number(formData.freight) + Number(formData.rounding);
//     const openBalance = grandTotal - (Number(formData.totalDownPayment) + Number(formData.appliedAmounts));
    
//     setFormData(prev => {
//         if (prev.grandTotal === round(grandTotal) && prev.totalBeforeDiscount === round(totalBeforeDiscount)) return prev;
//         return { ...prev, totalBeforeDiscount: round(totalBeforeDiscount), gstTotal: round(gstTotal), grandTotal: round(grandTotal), openBalance: round(openBalance) };
//     });
//   }, [formData.items, formData.freight, formData.rounding, formData.totalDownPayment, formData.appliedAmounts]);

//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     setFormData(prev => ({ ...prev, [name]: value }));
//   };

//   const validateForm = () => {
//     if (!formData.customerName || !formData.customerCode) {
//       toast.error("Please select a valid customer.");
//       return false;
//     }
//     if (!formData.orderDate) {
//       toast.error("Order date is required.");
//       return false;
//     }
//     if (formData.items.length === 0) {
//       toast.error("At least one item is required.");
//       return false;
//     }
//     for (let i = 0; i < formData.items.length; i++) {
//       const item = formData.items[i];
//       if (!item.item) { toast.error(`Item missing in row ${i + 1}`); return false; }
//       if (!item.warehouse) { toast.error(`Warehouse missing in row ${i + 1}`); return false; }
//       if (Number(item.quantity) <= 0) { toast.error(`Quantity must be > 0 in row ${i + 1}`); return false; }
//     }
//     return true;
//   };

//   const handleItemChange = (index, e) => {
//     const { name, value } = e.target;
//     setFormData(prev => {
//       const items = [...prev.items];
//       items[index] = { ...items[index], [name]: value, ...computeItemValues({ ...items[index], [name]: value }) };
//       return { ...prev, items };
//     });
//   };

//   const addItemRow = () => setFormData(p => ({ ...p, items: [...p.items, { ...stableInitial.items[0] }] }));
//   const removeItemRow = (i) => setFormData(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

//   const handleSubmit = async () => {
//     if (!validateForm()) return;
//     setSubmitting(true);
//     try {
//       const token = localStorage.getItem("token");
//       const normalizedItems = formData.items.map(i => ({
//         ...i,
//         item: typeof i.item === "object" ? i.item._id : i.item,
//         warehouse: typeof i.warehouse === "object" ? i.warehouse._id : i.warehouse,
//       }));
//       const fd = new FormData();
//       fd.append("orderData", JSON.stringify({ ...formData, items: normalizedItems, removedFiles }));
//       attachments.forEach(file => fd.append("newFiles", file));
      
//       const config = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } };
//       const res = editId
//         ? await axios.put(`/api/sales-order/${editId}`, fd, config)
//         : await axios.post("/api/sales-order", fd, config);

//       if (res.data.success) {
//         toast.success(editId ? "Updated" : "Created");
//         router.push("/admin/sales-order-view");
//       }
//     } catch (err) {
//       toast.error(err.response?.data?.message || "Error saving order");
//     } finally { setSubmitting(false); }
//   };

//   const renderNewFilesPreview = () => attachments.length > 0 && (
//     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-3">
//       {attachments.map((file, idx) => {
//         if (!(file instanceof File)) return null;
//         const url = URL.createObjectURL(file);
//         return (
//           <div key={idx} className="relative border rounded p-2 text-center bg-slate-100">
//             {file.type === "application/pdf"
//               ? <div className="h-24 flex items-center justify-center text-[10px] font-bold text-gray-500">PDF File</div>
//               : <img src={url} alt={file.name} className="h-24 w-full object-cover rounded" />}
//             <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs">×</button>
//           </div>
//         );
//       })}
//     </div>
//   );

//   if (loading) return <div className="p-10 text-center text-gray-400 font-bold">Loading Order...</div>;

//   return (
//     <div className="min-h-screen bg-gray-50">
//       <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

//         <button onClick={() => router.push("/admin/sales-order-view")}
//           className="flex items-center gap-1.5 text-indigo-600 font-semibold text-sm mb-4">
//           <FaArrowLeft className="text-xs" /> Back to List
//         </button>

//         <div className="mb-6">
//           <h1 className="text-2xl font-extrabold text-gray-900">{editId ? "Edit Sales Order" : "New Sales Order"}</h1>
//         </div>

//         {/* Customer Section */}
//         <SectionCard icon={FaUser} title="Customer Details" color="indigo">
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             <div>
//               <Lbl text="Customer Name" req />
//               {(editId || isCopied) ? (
//                 <input className={fi(isReadOnly)} name="customerName" value={formData.customerName || ""} onChange={handleChange} readOnly={isReadOnly} />
//               ) : isNewCustomer ? (
//                 <div className="space-y-2">
//                   <input className={fi()} name="customerName" value={formData.customerName || ""} onChange={handleChange} placeholder="Enter Name" />
//                   <button type="button" onClick={() => setIsNewCustomer(false)} className="text-[10px] font-bold text-gray-400 uppercase">⬅ Search existing</button>
//                 </div>
//               ) : (
//                 <div className="space-y-2">
//                   <CustomerSearch onSelectCustomer={(c) => {
//                     setSelectedCustomer(c);
//                     setFormData(p => ({ ...p, customer: c._id, customerName: c.customerName, customerCode: c.customerCode, contactPerson: c.contactPersonName }));
//                   }} />
//                   <button type="button" onClick={() => setIsNewCustomer(true)} className="text-[10px] font-bold text-indigo-600 uppercase">+ Add new</button>
//                 </div>
//               )}
//             </div>
//             <div><Lbl text="Customer Code" /><input className={fi(true)} value={formData.customerCode} readOnly /></div>
//             <div><Lbl text="Contact Person" /><input className={fi(true)} value={formData.contactPerson} readOnly /></div>
//             <div><Lbl text="Reference No." /><input className={fi(isReadOnly)} name="refNumber" value={formData.refNumber || ""} onChange={handleChange} placeholder="REF-001" readOnly={isReadOnly} /></div>
//           </div>
//         </SectionCard>

//         {/* Address Selection */}
//         <div className="mb-5">
//           <CustomerAddressSelector
//             customer={selectedCustomer}
//             selectedBillingAddress={formData.billingAddress}
//             selectedShippingAddress={formData.shippingAddress}
//             onBillingAddressSelect={(a) => setFormData(p => ({ ...p, billingAddress: a }))}
//             onShippingAddressSelect={(a) => setFormData(p => ({ ...p, shippingAddress: a }))}
//           />
//         </div>

//         {/* Scheduling Section */}
//         <SectionCard icon={FaCalendarAlt} title="Order Scheduling" color="blue">
//           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
//             <div><Lbl text="Order Date" req /><input type="date" className={fi(isReadOnly)} name="orderDate" value={formData.orderDate || ""} onChange={handleChange} readOnly={isReadOnly} /></div>
//             <div><Lbl text="Delivery Date" /><input type="date" className={fi(isReadOnly)} name="expectedDeliveryDate" value={formData.expectedDeliveryDate || ""} onChange={handleChange} readOnly={isReadOnly} /></div>
//             <div>
//               <Lbl text="Status" />
//               <select className={fi(isReadOnly)} name="status" value={formData.status} onChange={handleChange} disabled={isReadOnly}>
//                 <option>Open</option><option>Pending</option><option>Closed</option><option>Cancelled</option>
//               </select>
//             </div>
//           </div>
//         </SectionCard>

//         {/* Line Items Section */}
//         <div className="bg-white rounded-2xl shadow-sm border mb-5 overflow-hidden">
//           <div className="px-6 py-4 border-b bg-emerald-50/40 font-bold">Line Items</div>
//           <div className="p-4 overflow-x-auto">
//             <ItemSection items={formData.items} onItemChange={handleItemChange} onAddItem={addItemRow} onRemoveItem={removeItemRow} computeItemValues={computeItemValues} readOnly={isReadOnly} />
//           </div>
//         </div>

//         {/* Financial Summary Section */}
//         <SectionCard icon={FaCalculator} title="Financial Summary" color="amber">
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//             <div><Lbl text="Subtotal" /><input readOnly value={formData.totalBeforeDiscount} className={fi(true)} /></div>
//             <div><Lbl text="GST Total" /><input readOnly value={formData.gstTotal} className={fi(true)} /></div>
//             <div><Lbl text="Freight" /><input type="number" name="freight" value={formData.freight} onChange={handleChange} className={fi(isReadOnly)} readOnly={isReadOnly} /></div>
//             <div><Lbl text="Rounding" /><input type="number" name="rounding" value={formData.rounding} onChange={handleChange} className={fi(isReadOnly)} readOnly={isReadOnly} /></div>
//             <div>
//               <Lbl text="Grand Total" />
//               <div className="px-3 py-2.5 rounded-lg border-2 border-indigo-200 bg-indigo-50 text-indigo-700 font-extrabold">₹ {formData.grandTotal}</div>
//             </div>
//             <div><Lbl text="Open Balance" /><input readOnly value={formData.openBalance} className={fi(true)} /></div>
//           </div>
//           <div className="mt-4">
//             <Lbl text="Remarks" />
//             <textarea name="remarks" value={formData.remarks || ""} onChange={handleChange} rows={2} className={`${fi(isReadOnly)} resize-none`} readOnly={isReadOnly} />
//           </div>
//         </SectionCard>

//         {/* Attachments Section */}
//         <SectionCard icon={FaPaperclip} title="Attachments" color="gray">
//           <div className="mb-4">
//             {existingFiles.length > 0 && (
//               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
//                 {existingFiles.map((file, idx) => (
//                   <div key={idx} className="relative group border rounded-xl p-2 bg-gray-50">
//                     <div className="h-20 flex items-center justify-center overflow-hidden rounded-lg">
//                       {file.fileUrl?.toLowerCase().endsWith(".pdf")
//                         ? <div className="text-[10px] font-bold">PDF</div>
//                         : <img src={file.fileUrl} alt={file.fileName} className="h-full object-cover" />}
//                     </div>
//                     {!isReadOnly && (
//                       <button onClick={() => { setExistingFiles(prev => prev.filter((_, i) => i !== idx)); setRemovedFiles(prev => [...prev, file]); }}
//                         className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
//                         <FaTimes />
//                       </button>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//           {!isReadOnly && (
//             <label className="flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed border-gray-200 cursor-pointer hover:bg-indigo-50 transition-all">
//               <FaPaperclip className="text-gray-300" />
//               <span className="text-sm font-medium text-gray-400">Click to upload new files</span>
//               <input type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => {
//                 const files = Array.from(e.target.files);
//                 setAttachments(prev => [...prev, ...files]);
//                 e.target.value = "";
//               }} />
//             </label>
//           )}
//           {renderNewFilesPreview()}
//         </SectionCard>

//         {/* Footer Actions */}
//         <div className="flex items-center justify-between pt-4 pb-10">
//           <button onClick={() => router.push("/admin/sales-order-view")} className="px-6 py-2.5 rounded-xl bg-white border font-bold text-sm">Cancel</button>
//           <button onClick={handleSubmit} disabled={submitting || isReadOnly} className={`px-8 py-2.5 rounded-xl text-white font-bold text-sm ${submitting || isReadOnly ? "bg-gray-300" : "bg-indigo-600 shadow-lg"}`}>
//             {submitting ? "Processing..." : editId ? "Update Order" : "Create Order"}
//           </button>
//         </div>
//       </div>
//       <ToastContainer />
//     </div>
//   );
// }
