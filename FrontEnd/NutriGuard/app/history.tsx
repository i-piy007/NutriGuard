import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

export default function History() {
	const data = [
		{ id: '1', label: 'Sample item 1', date: '2025-11-09 14:23' },
		{ id: '2', label: 'Sample item 2', date: '2025-11-08 09:10' },
	];

	return (
		<View style={styles.container}>
			<Text style={styles.title}>History</Text>
			<FlatList
				data={data}
				keyExtractor={(i) => i.id}
				renderItem={({ item }) => (
					<View style={styles.row}>
						<Text style={styles.label}>{item.label}</Text>
						<Text style={styles.date}>{item.date}</Text>
					</View>
				)}
				ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
				contentContainerStyle={{ paddingVertical: 12 }}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#fff', padding: 16 },
	title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
	row: { backgroundColor: '#f7f7f7', padding: 12, borderRadius: 8 },
	label: { fontSize: 16, fontWeight: '600', color: '#222' },
	date: { fontSize: 12, color: '#666', marginTop: 4 },
});

