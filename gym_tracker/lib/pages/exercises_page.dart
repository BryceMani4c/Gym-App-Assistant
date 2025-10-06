import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

// Simple data models (keep here so no other files are needed)
class Exercise {
  final String name;
  final List<Target> targets;
  const Exercise({required this.name, required this.targets});
}

class Target {
  final String group;     // e.g., Chest, Shoulder, Biceps...
  final String subregion; // e.g., Mid Chest (Sternal Pectoralis Major)
  const Target(this.group, this.subregion);
}

class ExercisesPage extends StatefulWidget {
  const ExercisesPage({super.key});

  @override
  State<ExercisesPage> createState() => _ExercisesPageState();
}

class _ExercisesPageState extends State<ExercisesPage> {
  late Future<List<Exercise>> _exercises;

  // Control the order groups appear in the UI
  static const List<String> _groupOrder = [
    'Chest',
    'Shoulder',
    'Biceps',
    'Triceps',
    'Legs',
    'Back',
    'Abs',
  ];

  @override
  void initState() {
    super.initState();
    _exercises = _loadExercisesCsv('lib/data/exercises.csv');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Exercises by Muscle Group')),
      body: FutureBuilder<List<Exercise>>(
        future: _exercises,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Could not load exercises.csv:\n${snap.error}',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          final data = snap.data ?? const <Exercise>[];
          if (data.isEmpty) {
            return const Center(child: Text('No exercises found.'));
          }

          // Group: groupName -> [exercises]
          final Map<String, List<Exercise>> byGroup = {
            for (final g in _groupOrder) g: <Exercise>[]
          };
          for (final e in data) {
            // each exercise may target multiple groups; list it under each
            final groups = e.targets.map((t) => t.group).toSet();
            for (final g in groups) {
              byGroup.putIfAbsent(g, () => <Exercise>[]).add(e);
            }
          }

          // Only show non-empty groups; respect _groupOrder then any extras
          final visibleGroups = [
            ..._groupOrder.where((g) => (byGroup[g] ?? []).isNotEmpty),
            ...byGroup.keys
                .where((g) => !_groupOrder.contains(g))
                .where((g) => (byGroup[g] ?? []).isNotEmpty),
          ];

          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: visibleGroups.length,
            itemBuilder: (context, i) {
              final group = visibleGroups[i];
              final items = byGroup[group]!..sort((a, b) => a.name.compareTo(b.name));

              return Card(
                margin: const EdgeInsets.symmetric(vertical: 8),
                child: ExpansionTile(
                  title: Text(group, style: const TextStyle(fontWeight: FontWeight.w600)),
                  trailing: _CountBadge(count: items.length),
                  children: [
                    const Divider(height: 1),
                    ...items.map((e) {
                      // subregion chips for this group only (filter targets)
                      final chips = e.targets
                          .where((t) => t.group == group)
                          .map((t) => Chip(
                                label: Text(t.subregion),
                                visualDensity: VisualDensity.compact,
                                padding: EdgeInsets.zero,
                              ))
                          .toList();

                      return ListTile(
                        leading: const Icon(Icons.fitness_center),
                        title: Text(e.name),
                        subtitle: chips.isEmpty
                            ? null
                            : Wrap(spacing: 6, runSpacing: -8, children: chips),
                        onTap: () {
                          // TODO: navigate to a detail page if desired
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Selected ${e.name}')),
                          );
                        },
                      );
                    }),
                    const SizedBox(height: 8),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  // ---- CSV loader (kept local to this page) ----

  Future<List<Exercise>> _loadExercisesCsv(String assetPath) async {
    final raw = await rootBundle.loadString(assetPath);
    final lines = const LineSplitter().convert(raw);

    if (lines.isEmpty) return const <Exercise>[];

    // Expect header: Name,MuscleGroup,SubregionPairs
    // SubregionPairs is a semicolon-separated list of "Group,Subregion" pairs.
    // Example:
    // Bench Press,Chest,"Chest,Mid Chest (Sternal Pectoralis Major); Shoulder,Front Delts (Anterior Deltoid); Triceps,Lateral Head (Caput Laterale)"
    final header = _splitCsvRow(lines.first);
    if (header.length < 3 ||
        header[0].toLowerCase() != 'name' ||
        header[1].toLowerCase() != 'musclegroup' ||
        !header[2].toLowerCase().startsWith('subregion')) {
      throw StateError('CSV header should be: Name,MuscleGroup,SubregionPairs');
    }

    final result = <Exercise>[];
    for (var i = 1; i < lines.length; i++) {
      var row = lines[i].trim();
      if (row.isEmpty) continue;

      final cols = _splitCsvRow(row);
      if (cols.length < 3) continue;

      final name = cols[0].trim();
      // The first MuscleGroup column is the primary group label (for readability).
      // Real targets are parsed from SubregionPairs below.
      final primaryGroup = cols[1].trim(); // not strictly required but kept
      final subregionPairs = cols[2].trim();

      final targets = <Target>[];

      if (subregionPairs.isNotEmpty) {
        // pairs like: 'Chest,Mid Chest (...); Shoulder,Front Delts (...); Triceps,Lateral Head (...)'
        for (final pair in _splitBySemicolons(subregionPairs)) {
          final p = _splitTopLevelComma(pair);
          if (p.length >= 2) {
            targets.add(Target(p[0].trim(), p[1].trim()));
          }
        }
      }

      // If the row didn’t include any pairs, fall back to the primary group only.
      if (targets.isEmpty && primaryGroup.isNotEmpty) {
        targets.add(Target(primaryGroup, ''));
      }

      result.add(Exercise(name: name, targets: targets));
    }
    return result;
  }

  /// Basic CSV splitter that respects quoted fields.
  List<String> _splitCsvRow(String row) {
    final result = <String>[];
    final buf = StringBuffer();
    var inQuotes = false;

    for (int i = 0; i < row.length; i++) {
      final c = row[i];
      if (c == '"') {
        // handle doubled quotes "" -> literal "
        if (inQuotes && i + 1 < row.length && row[i + 1] == '"') {
          buf.write('"');
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c == ',' && !inQuotes) {
        result.add(buf.toString());
        buf.clear();
      } else {
        buf.write(c);
      }
    }
    result.add(buf.toString());
    return result.map((e) => e.trim()).toList();
  }

  /// Split a semicolon-separated string at top level (not inside quotes).
  List<String> _splitBySemicolons(String s) {
    final out = <String>[];
    final buf = StringBuffer();
    var inQuotes = false;

    for (int i = 0; i < s.length; i++) {
      final c = s[i];
      if (c == '"') {
        if (inQuotes && i + 1 < s.length && s[i + 1] == '"') {
          buf.write('"');
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c == ';' && !inQuotes) {
        out.add(buf.toString());
        buf.clear();
      } else {
        buf.write(c);
      }
    }
    out.add(buf.toString());
    return out.map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  }

  /// Split once on the first top-level comma (Group,Subregion).
  List<String> _splitTopLevelComma(String s) {
    final buf = StringBuffer();
    var inQuotes = false;
    for (int i = 0; i < s.length; i++) {
      final c = s[i];
      if (c == '"') {
        if (inQuotes && i + 1 < s.length && s[i + 1] == '"') {
          buf.write('"');
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c == ',' && !inQuotes) {
        // split here
        final left = buf.toString();
        final right = s.substring(i + 1);
        return [left, right];
      } else {
        buf.write(c);
      }
    }
    return [s]; // no comma found
  }
}

/* ---------- tiny UI helper ---------- */
class _CountBadge extends StatelessWidget {
  final int count;
  const _CountBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: cs.secondaryContainer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text('$count',
          style: TextStyle(color: cs.onSecondaryContainer, fontWeight: FontWeight.w600)),
    );
  }
}
