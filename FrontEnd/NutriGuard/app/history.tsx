import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface HistoryItem {
  id: number;
  timestamp: string;
  image_url?: string;
  scan_type: 'food' | 'raw_ingredients';
  result_json: string;
}

export default function History() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          console.log('No token, skipping history fetch');
          setLoading(false);
          return;
        }
        const resp = await fetch('https://nutriguard-n98n.onrender.com/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error('Failed to fetch history');
        const data = await resp.json();
        setHistory(data.history || []);
      } catch (err) {
        console.error('Error fetching history:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  const getTitle = (item: HistoryItem) => {
    try {
      const parsed = JSON.parse(item.result_json);
      if (item.scan_type === 'food' && parsed.itemName) return parsed.itemName;
      if (item.scan_type === 'raw_ingredients') return 'Raw Ingredients';
    } catch {}
    return item.scan_type === 'food' ? 'Food Scan' : 'Ingredient Scan';
  };

  const handlePress = (item: HistoryItem) => {
    try {
      const parsed = JSON.parse(item.result_json);
      if (item.scan_type === 'food') {
        router.push({
          pathname: '/food_add',
          params: {
            imageUrl: item.image_url,
            itemName: parsed.itemName || 'Food',
            nutrition: JSON.stringify(parsed.nutrition || {})
          }
        });
      } else if (item.scan_type === 'raw_ingredients') {
        router.push({
          pathname: '/raw_ingredients_result',
          params: {
            imageUrl: item.image_url,
            ingredients: parsed.ingredients || '[]',
            dishes: parsed.dishes || '[]'
          }
        });
      }
    } catch (err) {
      console.error('Error navigating to history item:', err);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#90be6d" />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <MaterialIcons name="history" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No scan history yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => handlePress(item)}>
            {item.image_url && (
              <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
            )}
            <View style={styles.content}>
              <Text style={styles.title}>{getTitle(item)}</Text>
              <Text style={styles.type}>{item.scan_type === 'food' ? 'Food Scan' : 'Ingredient Scan'}</Text>
              <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#999" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  thumbnail: { width: 60, height: 60, borderRadius: 8, marginRight: 12, backgroundColor: '#e0e0e0' },
  content: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#333' },
  type: { fontSize: 13, color: '#666', marginBottom: 2 },
  timestamp: { fontSize: 12, color: '#999' },
});

