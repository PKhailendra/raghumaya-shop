import { useState, useEffect } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useCategories,
  useBrands,
  ProductInput,
} from '../../src/api/products';
import { normalizeBarcode } from '../../src/api/barcodeLookup';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ApiError } from '../../src/api/client';
import { theme } from '../../src/theme';

export default function ProductFormScreen() {
  const router = useRouter();
  const {
    id,
    barcode: barcodeParam,
    name: nameParam,
    brand: brandParam,
    category: categoryParam,
    description: descriptionParam,
    packSize: packSizeParam,
    model: modelParam,
    imageUrl: imageUrlParam,
  } = useLocalSearchParams<{
    id?: string;
    barcode?: string;
    name?: string;
    brand?: string;
    category?: string;
    description?: string;
    packSize?: string;
    model?: string;
    imageUrl?: string;
  }>();
  const isEdit = !!id;

  const { data: existing, isLoading } = useProduct(id ?? '');
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const { data: categoriesData } = useCategories();
  const { data: brandsData } = useBrands();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [description, setDescription] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [hsnCode, setHsnCode] = useState('');
  const [currentStock, setCurrentStock] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [isActive, setIsActive] = useState(true);
  const [pickerFor, setPickerFor] = useState<'category' | 'brand' | null>(null);
  const [images, setImages] = useState<{ url: string; isPrimary: boolean }[]>([]);
  const [variants, setVariants] = useState<{
    name: string; sku: string; barcode: string; qrCode: string;
    purchasePrice: string; sellingPrice: string; currentStock: string;
  }[]>([]);
  const [initialized, setInitialized] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Prefill from scan (new product flow) — auto-generate unique SKU from name + barcode
  // Lookup data (name/brand/category/description) arrives in English and is used as-is.
  useEffect(() => {
    if (!isEdit && !initialized) {
      if (barcodeParam) setBarcode(barcodeParam);
      if (nameParam) {
        setName(nameParam);
        // Auto-generate SKU: "Brooke Bond Tea" + barcode "8901030893568" → "brooke-bond-tea-3568"
        // Barcode suffix ensures uniqueness per shop (DB has @@unique([shopId, sku]))
        const namePart = nameParam
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30);
        const barcodeSuffix = (barcodeParam ?? '').replace(/\D/g, '').slice(-4);
        const autoSku = [namePart, barcodeSuffix].filter(Boolean).join('-');
        if (autoSku) setSku(autoSku);
      }
      // Try to match lookup brand/category names to existing records (case-insensitive).
      // Unmatched names stay visible in description so nothing from the lookup is lost.
      const unmatched: string[] = [];
      if (brandParam && brandsData) {
        const list = Array.isArray(brandsData) ? brandsData : (brandsData as { data?: unknown[] }).data ?? [];
        const match = (list as { id: string; name: string }[]).find(
          (b) => b.name.toLowerCase() === brandParam.toLowerCase(),
        );
        if (match) setBrandId(match.id);
        else unmatched.push(`Brand: ${brandParam}`);
      } else if (brandParam) {
        unmatched.push(`Brand: ${brandParam}`);
      }
      if (categoryParam && categoriesData) {
        const list = Array.isArray(categoriesData) ? categoriesData : (categoriesData as { data?: unknown[] }).data ?? [];
        const match = (list as { id: string; name: string }[]).find(
          (c) => c.name.toLowerCase() === categoryParam.toLowerCase(),
        );
        if (match) setCategoryId(match.id);
        else unmatched.push(`Category: ${categoryParam}`);
      } else if (categoryParam) {
        unmatched.push(`Category: ${categoryParam}`);
      }
      // Remaining enrichment extras folded into description so nothing is lost.
      const extras = [
        ...unmatched,
        modelParam ? `Model: ${modelParam}` : '',
        packSizeParam ? `Pack: ${packSizeParam}` : '',
        descriptionParam ?? '',
      ].filter(Boolean).join('\n');
      if (extras) setDescription(extras);
      // Auto-fill product image from lookup (used as-is, in English)
      if (imageUrlParam) setImages([{ url: imageUrlParam, isPrimary: true }]);
      if (barcodeParam || nameParam) setInitialized(true);
    }
  }, [isEdit, barcodeParam, nameParam, brandParam, categoryParam, descriptionParam, packSizeParam, modelParam, imageUrlParam, brandsData, categoriesData, initialized]);
  useEffect(() => {
    if (isEdit && existing && !initialized) {
      setName(existing.name ?? '');
      setSku(existing.sku ?? '');
      setBarcode(existing.barcode ?? '');
      setQrCode((existing as { qrCode?: string }).qrCode ?? '');
      setCategoryId((existing as { categoryId?: string }).categoryId ?? '');
      setBrandId((existing as { brandId?: string }).brandId ?? '');
      setDescription((existing as { description?: string }).description ?? '');
      setSellingPrice(existing.sellingPrice ?? '');
      setPurchasePrice(existing.purchasePrice ?? '');
      setMrp(existing.mrp ?? '');
      setTaxRate((existing as { taxRate?: string }).taxRate ?? (existing as { gstRate?: string }).gstRate ?? '0');
      setHsnCode((existing as { hsnCode?: string }).hsnCode ?? '');
      setCurrentStock(existing.currentStock ?? '');
      setMinStockLevel(existing.minStockLevel ?? '');
      setUnit(existing.unit ?? 'pcs');
      setIsActive((existing as { isActive?: boolean }).isActive ?? true);
      const exImgs = (existing as { images?: { url: string; isPrimary?: boolean }[] }).images ?? [];
      if (exImgs.length) setImages(exImgs.map((img) => ({ url: img.url, isPrimary: !!img.isPrimary })));
      const exVars = (existing as { variants?: { name: string; sku?: string; barcode?: string; qrCode?: string; purchasePrice?: string; sellingPrice?: string; price?: string; currentStock?: string; stockQuantity?: number }[] }).variants ?? [];
      if (exVars.length) setVariants(exVars.map((v) => ({
        name: v.name ?? '', sku: v.sku ?? '', barcode: v.barcode ?? '', qrCode: v.qrCode ?? '',
        purchasePrice: v.purchasePrice ?? '', sellingPrice: v.sellingPrice ?? v.price ?? '',
        currentStock: v.currentStock ?? (v.stockQuantity != null ? String(v.stockQuantity) : ''),
      })));
      setInitialized(true);
    }
  }, [isEdit, existing, initialized]);

  const startScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera needed', 'Allow camera access to scan barcodes.');
        return;
      }
    }
    setScanning(true);
  };

  const handleBarCodeScanned = ({ data, type }: { data: string; type: string }) => {
    setScanning(false);
    setTorchOn(false);
    setBarcode(normalizeBarcode(data, type));
  };

  const submit = () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Product name is required.');
      return;
    }
    if (!categoryId) {
      Alert.alert('Missing category', 'Please select a category — it powers the inventory filters.');
      return;
    }
    const price = parseFloat(sellingPrice);
    if (Number.isNaN(price) || price < 0) {
      Alert.alert('Invalid price', 'Enter a valid selling price.');
      return;
    }
    const payload: ProductInput = {
      name: name.trim(),
      sellingPrice: price.toFixed(2),
      categoryId,
      ...(sku.trim() ? { sku: sku.trim() } : {}),
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      ...(qrCode.trim() ? { qrCode: qrCode.trim() } : {}),
      ...(brandId ? { brandId } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(purchasePrice.trim() ? { purchasePrice: parseFloat(purchasePrice).toFixed(2) } : {}),
      ...(mrp.trim() ? { mrp: parseFloat(mrp).toFixed(2) } : {}),
      ...(taxRate.trim() ? { taxRate: taxRate.trim(), gstRate: taxRate.trim() } : {}),
      ...(hsnCode.trim() ? { hsnCode: hsnCode.trim() } : {}),
      ...(currentStock.trim() ? { currentStock: currentStock.trim() } : {}),
      ...(minStockLevel.trim() ? { minStockLevel: minStockLevel.trim(), reorderLevel: minStockLevel.trim() } : {}),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      isActive,
      ...(images.filter((img) => img.url.trim()).length
        ? { images: images.filter((img) => img.url.trim()).map((img, i) => ({ url: img.url.trim(), isPrimary: img.isPrimary, sortOrder: i })) }
        : {}),
      ...(variants.filter((v) => v.name.trim()).length
        ? {
            variants: variants.filter((v) => v.name.trim()).map((v) => ({
              name: v.name.trim(),
              ...(v.sku.trim() ? { sku: v.sku.trim() } : {}),
              ...(v.barcode.trim() ? { barcode: v.barcode.trim() } : {}),
              ...(v.qrCode.trim() ? { qrCode: v.qrCode.trim() } : {}),
              ...(v.purchasePrice.trim() ? { purchasePrice: v.purchasePrice.trim() } : {}),
              ...(v.sellingPrice.trim() ? { sellingPrice: v.sellingPrice.trim() } : {}),
              ...(v.currentStock.trim() ? { currentStock: v.currentStock.trim() } : {}),
            })),
          }
        : {}),
    };
    const onSuccess = () => {
      Alert.alert('Saved', `Product ${isEdit ? 'updated' : 'created'} successfully.`);
      router.back();
    };
    const onError = (e: unknown) => {
      Alert.alert('Failed', e instanceof ApiError ? e.message : 'Could not save the product.');
    };
    if (isEdit) {
      update.mutate({ id: id!, payload }, { onSuccess, onError });
    } else {
      create.mutate(payload, { onSuccess, onError });
    }
  };

  if (isEdit && isLoading) return <LoadingSpinner />;

  const pending = create.isPending || update.isPending;

  const categoryList = (() => {
    const d = categoriesData as unknown;
    const arr = Array.isArray(d) ? d : (d as { data?: unknown[] })?.data ?? [];
    return (arr as { id: string; name: string }[]);
  })();
  const brandList = (() => {
    const d = brandsData as unknown;
    const arr = Array.isArray(d) ? d : (d as { data?: unknown[] })?.data ?? [];
    return (arr as { id: string; name: string }[]);
  })();
  const categoryName = (id: string) => categoryList.find((c) => c.id === id)?.name ?? '';
  const brandName = (id: string) => brandList.find((b) => b.id === id)?.name ?? '';

  if (scanning) {
    return (
      <View style={styles.scannerWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{
            barcodeTypes: ['aztec', 'codabar', 'code39', 'code93', 'code128', 'datamatrix', 'ean13', 'ean8', 'itf14', 'pdf417', 'qr', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <View style={styles.scannerOverlay} pointerEvents="none">
          <Text style={styles.scannerText}>Point at the product barcode</Text>
        </View>
        <TouchableOpacity style={styles.torchBtn} onPress={() => setTorchOn((v) => !v)}>
          <Text style={styles.torchText}>{torchOn ? '🔦 ON' : '🔦 OFF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scannerCancel} onPress={() => { setScanning(false); setTorchOn(false); }}>
          <Text style={styles.scannerCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{isEdit ? 'Edit product' : 'Add product'}</Text>

      <Text style={styles.label}>Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Tea Pack 100g" placeholderTextColor={theme.colors.muted} />

      <Text style={styles.label}>Barcode</Text>
      <View style={styles.barcodeRow}>
        <TextInput
          style={[styles.input, styles.barcodeInput]}
          value={barcode}
          onChangeText={setBarcode}
          placeholder="Scan or type barcode"
          placeholderTextColor={theme.colors.muted}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.scanBtn} onPress={startScan}>
          <Text style={styles.scanBtnText}>📷 Scan</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>SKU</Text>
      <TextInput style={styles.input} value={sku} onChangeText={setSku} placeholder="Optional" placeholderTextColor={theme.colors.muted} />

      <Text style={styles.label}>QR Code (optional)</Text>
      <TextInput style={styles.input} value={qrCode} onChangeText={setQrCode} placeholder="QR code value" placeholderTextColor={theme.colors.muted} />

      <Text style={styles.label}>Category *</Text>
      <TouchableOpacity style={styles.input} onPress={() => setPickerFor('category')}>
        <Text style={categoryId ? styles.pickerValue : styles.pickerPlaceholder}>
          {categoryName(categoryId) || 'Select category (required for filters)'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Brand (optional)</Text>
      <TouchableOpacity style={styles.input} onPress={() => setPickerFor('brand')}>
        <Text style={brandId ? styles.pickerValue : styles.pickerPlaceholder}>
          {brandName(brandId) || 'Select brand'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Auto-filled from barcode lookup (editable)"
        placeholderTextColor={theme.colors.muted}
        multiline
        numberOfLines={3}
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Selling price *</Text>
          <TextInput style={styles.input} value={sellingPrice} onChangeText={setSellingPrice} placeholder="0.00" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>MRP</Text>
          <TextInput style={styles.input} value={mrp} onChangeText={setMrp} placeholder="Optional" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Purchase price</Text>
          <TextInput style={styles.input} value={purchasePrice} onChangeText={setPurchasePrice} placeholder="Optional" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Unit</Text>
          <TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="pcs" placeholderTextColor={theme.colors.muted} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Tax rate % (optional)</Text>
          <TextInput style={styles.input} value={taxRate} onChangeText={setTaxRate} placeholder="0" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>HSN code (optional)</Text>
          <TextInput style={styles.input} value={hsnCode} onChangeText={setHsnCode} placeholder="e.g. 0902" placeholderTextColor={theme.colors.muted} />
        </View>
      </View>

      {!isEdit && (
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Opening stock</Text>
            <TextInput style={styles.input} value={currentStock} onChangeText={setCurrentStock} placeholder="0" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Min stock alert</Text>
            <TextInput style={styles.input} value={minStockLevel} onChangeText={setMinStockLevel} placeholder="Optional" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.toggleRow} onPress={() => setIsActive((v) => !v)}>
        <Text style={styles.toggleLabel}>Active product</Text>
        <Text style={styles.toggleValue}>{isActive ? '✅ Yes' : '❌ No'}</Text>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Product images (optional)</Text>
        <TouchableOpacity onPress={() => setImages([...images, { url: '', isPrimary: images.length === 0 }])}>
          <Text style={styles.addBtn}>+ Add image</Text>
        </TouchableOpacity>
      </View>
      {images.map((img, i) => (
        <View key={i} style={styles.imageRow}>
          <TextInput
            style={[styles.input, styles.imageInput]}
            value={img.url}
            onChangeText={(t) => setImages(images.map((x, j) => (j === i ? { ...x, url: t } : x)))}
            placeholder="https://… image URL"
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setImages(images.map((x, j) => ({ ...x, isPrimary: j === i })))}>
            <Text style={styles.primaryToggle}>{img.isPrimary ? '⭐' : '☆'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setImages(images.filter((_, j) => j !== i))}>
            <Text style={styles.removeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      {images.length === 0 && <Text style={styles.hint}>No images yet. Auto-filled from barcode lookup when available.</Text>}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Variants (optional)</Text>
        <TouchableOpacity onPress={() => setVariants([...variants, { name: '', sku: '', barcode: '', qrCode: '', purchasePrice: '', sellingPrice: '', currentStock: '' }])}>
          <Text style={styles.addBtn}>+ Add variant</Text>
        </TouchableOpacity>
      </View>
      {variants.map((v, i) => (
        <View key={i} style={styles.variantCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.variantTitle}>Variant {i + 1}</Text>
            <TouchableOpacity onPress={() => setVariants(variants.filter((_, j) => j !== i))}>
              <Text style={styles.removeBtn}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>Variant name *</Text>
          <TextInput style={styles.input} value={v.name} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: t } : x)))} placeholder="e.g. 500g pack" placeholderTextColor={theme.colors.muted} />
          <Text style={styles.label}>SKU (optional)</Text>
          <TextInput style={styles.input} value={v.sku} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, sku: t } : x)))} placeholder="Optional" placeholderTextColor={theme.colors.muted} />
          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Barcode</Text>
              <TextInput style={styles.input} value={v.barcode} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, barcode: t } : x)))} placeholder="Optional" placeholderTextColor={theme.colors.muted} keyboardType="numeric" />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>QR code</Text>
              <TextInput style={styles.input} value={v.qrCode} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, qrCode: t } : x)))} placeholder="Optional" placeholderTextColor={theme.colors.muted} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Purchase price</Text>
              <TextInput style={styles.input} value={v.purchasePrice} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, purchasePrice: t } : x)))} placeholder="Optional" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Selling price</Text>
              <TextInput style={styles.input} value={v.sellingPrice} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, sellingPrice: t } : x)))} placeholder="Optional" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
            </View>
          </View>
          <Text style={styles.label}>Stock (optional)</Text>
          <TextInput style={styles.input} value={v.currentStock} onChangeText={(t) => setVariants(variants.map((x, j) => (j === i ? { ...x, currentStock: t } : x)))} placeholder="0" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" />
        </View>
      ))}
      {variants.length === 0 && <Text style={styles.hint}>No variants yet. Add if this product sells in multiple packs/sizes.</Text>}

      <TouchableOpacity style={[styles.saveBtn, pending && styles.saveBtnDisabled]} onPress={submit} disabled={pending}>
        <Text style={styles.saveBtnText}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}</Text>
      </TouchableOpacity>

      {pickerFor && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerBox}>
              <Text style={styles.pickerTitle}>{pickerFor === 'category' ? 'Select category' : 'Select brand'}</Text>
              <ScrollView style={styles.pickerList}>
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => { if (pickerFor === 'category') setCategoryId(''); else setBrandId(''); setPickerFor(null); }}
                >
                  <Text style={styles.pickerItemText}>— None —</Text>
                </TouchableOpacity>
                {(pickerFor === 'category' ? categoryList : brandList).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.pickerItem}
                    onPress={() => { if (pickerFor === 'category') setCategoryId(item.id); else setBrandId(item.id); setPickerFor(null); }}
                  >
                    <Text style={styles.pickerItemText}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.pickerCancel} onPress={() => setPickerFor(null)}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.subtext, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, fontSize: 15, color: theme.colors.text },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  barcodeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  barcodeInput: { flex: 1 },
  scanBtn: { backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.sm, paddingVertical: 12, paddingHorizontal: 16 },
  scanBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  saveBtn: { marginTop: 24, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  toggleValue: { fontSize: 15, color: theme.colors.subtext },
  pickerValue: { fontSize: 15, color: theme.colors.text },
  pickerPlaceholder: { fontSize: 15, color: theme.colors.muted },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerBox: { backgroundColor: theme.colors.card, borderRadius: theme.radius.sm, width: '100%', maxHeight: '70%', padding: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  pickerList: { maxHeight: 300 },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  pickerItemText: { fontSize: 15, color: theme.colors.text },
  pickerCancel: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  pickerCancelText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  addBtn: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  hint: { fontSize: 12, color: theme.colors.muted, marginTop: 4 },
  imageRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  imageInput: { flex: 1 },
  primaryToggle: { fontSize: 22 },
  removeBtn: { fontSize: 14, fontWeight: '700', color: theme.colors.danger ?? '#d32f2f' },
  variantCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, marginTop: 8 },
  variantTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.subtext },
  scannerWrap: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 120 },
  scannerText: { color: '#fff', fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  scannerCancel: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  scannerCancelText: { fontWeight: '700', fontSize: 15, color: '#111' },
  torchBtn: { position: 'absolute', top: 60, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 24, paddingVertical: 10, paddingHorizontal: 16 },
  torchText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
