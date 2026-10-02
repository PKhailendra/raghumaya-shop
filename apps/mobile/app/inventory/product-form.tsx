import { useState, useEffect } from 'react';
import {
  Alert,
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
  ProductInput,
} from '../../src/api/products';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { ApiError } from '../../src/api/client';
import { theme } from '../../src/theme';

export default function ProductFormScreen() {
  const router = useRouter();
  const { id, barcode: barcodeParam, name: nameParam } = useLocalSearchParams<{
    id?: string;
    barcode?: string;
    name?: string;
  }>();
  const isEdit = !!id;

  const { data: existing, isLoading } = useProduct(id ?? '');
  const create = useCreateProduct();
  const update = useUpdateProduct();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [currentStock, setCurrentStock] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [initialized, setInitialized] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);

  // Prefill from scan (new product flow) — auto-generate unique SKU from name + barcode
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
      if (barcodeParam || nameParam) setInitialized(true);
    }
  }, [isEdit, barcodeParam, nameParam, initialized]);
  useEffect(() => {
    if (isEdit && existing && !initialized) {
      setName(existing.name ?? '');
      setSku(existing.sku ?? '');
      setBarcode(existing.barcode ?? '');
      setSellingPrice(existing.sellingPrice ?? '');
      setPurchasePrice(existing.purchasePrice ?? '');
      setMrp(existing.mrp ?? '');
      setCurrentStock(existing.currentStock ?? '');
      setMinStockLevel(existing.minStockLevel ?? '');
      setUnit(existing.unit ?? 'pcs');
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

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanning(false);
    setBarcode(data);
  };

  const submit = () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Product name is required.');
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
      ...(sku.trim() ? { sku: sku.trim() } : {}),
      ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
      ...(purchasePrice.trim() ? { purchasePrice: parseFloat(purchasePrice).toFixed(2) } : {}),
      ...(mrp.trim() ? { mrp: parseFloat(mrp).toFixed(2) } : {}),
      ...(currentStock.trim() ? { currentStock: currentStock.trim() } : {}),
      ...(minStockLevel.trim() ? { minStockLevel: minStockLevel.trim() } : {}),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
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

  if (scanning) {
    return (
      <View style={styles.scannerWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['aztec', 'codabar', 'code39', 'code93', 'code128', 'datamatrix', 'ean13', 'ean8', 'itf14', 'pdf417', 'qr', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        />
        <View style={styles.scannerOverlay} pointerEvents="none">
          <Text style={styles.scannerText}>Point at the product barcode</Text>
        </View>
        <TouchableOpacity style={styles.scannerCancel} onPress={() => setScanning(false)}>
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

      <TouchableOpacity style={[styles.saveBtn, pending && styles.saveBtnDisabled]} onPress={submit} disabled={pending}>
        <Text style={styles.saveBtnText}>{pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.subtext, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, fontSize: 15, color: theme.colors.text },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  barcodeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  barcodeInput: { flex: 1 },
  scanBtn: { backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.sm, paddingVertical: 12, paddingHorizontal: 16 },
  scanBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  saveBtn: { marginTop: 24, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  scannerWrap: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 120 },
  scannerText: { color: '#fff', fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  scannerCancel: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  scannerCancelText: { fontWeight: '700', fontSize: 15, color: '#111' },
});
