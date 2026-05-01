"""
优化的基因算法实现
包含智能突变、适应性交叉等高级特性
"""
from typing import Dict, List, Any, Optional, Tuple, Callable
from dataclasses import dataclass
from enum import Enum
import random
import numpy as np
from copy import deepcopy
import math
from datetime import datetime


class MutationType(Enum):
    """突变类型枚举"""
    GAUSSIAN = "gaussian"          # 高斯突变
    UNIFORM = "uniform"            # 均匀突变
    ADAPTIVE = "adaptive"          # 自适应突变
    SMART = "smart"                # 智能突变
    TARGETED = "targeted"          # 目标突变


class CrossoverType(Enum):
    """交叉类型枚举"""
    SINGLE_POINT = "single_point"  # 单点交叉
    TWO_POINT = "two_point"        # 两点交叉
    UNIFORM = "uniform"            # 均匀交叉
    ADAPTIVE = "adaptive"          # 自适应交叉
    SIMILARITY_BASED = "similarity_based"  # 基于相似度的交叉


@dataclass
class GeneticConfig:
    """基因算法配置"""
    population_size: int = 50
    mutation_rate: float = 0.1
    crossover_rate: float = 0.8
    elitism_rate: float = 0.1
    tournament_size: int = 3
    max_generations: int = 100
    convergence_threshold: float = 1e-6
    diversity_threshold: float = 0.1
    
    # 高级配置
    adaptive_mutation: bool = True
    adaptive_crossover: bool = True
    smart_mutation: bool = True
    similarity_based_crossover: bool = True
    
    # 突变配置
    mutation_types: List[MutationType] = None
    mutation_weights: List[float] = None
    
    # 交叉配置
    crossover_types: List[CrossoverType] = None
    crossover_weights: List[float] = None


@dataclass
class Individual:
    """个体（策略基因）"""
    gene: Dict[str, Any]
    fitness: float = 0.0
    age: int = 0
    generation: int = 0
    parent_ids: List[str] = None
    mutation_history: List[str] = None
    diversity_score: float = 0.0
    
    def __post_init__(self):
        if self.parent_ids is None:
            self.parent_ids = []
        if self.mutation_history is None:
            self.mutation_history = []
    
    def get_gene_id(self) -> str:
        """获取基因ID"""
        template_id = self.gene.get("template_id", "unknown")
        params_hash = hash(str(sorted(self.gene.get("parameters", {}).items())))
        return f"{template_id}_{abs(params_hash) % 10000:04d}"


class AdvancedGeneticAlgorithm:
    """高级基因算法"""
    
    def __init__(self, config: GeneticConfig, fitness_function: Callable[[Dict[str, Any]], float]):
        self.config = config
        self.fitness_function = fitness_function
        self.population: List[Individual] = []
        self.generation = 0
        self.best_individual: Optional[Individual] = None
        self.fitness_history: List[float] = []
        self.diversity_history: List[float] = []
        
        # 自适应参数
        self.mutation_rate = config.mutation_rate
        self.crossover_rate = config.crossover_rate
        self.performance_history: List[float] = []
        
        # 初始化突变和交叉类型
        if config.mutation_types is None:
            config.mutation_types = [MutationType.GAUSSIAN, MutationType.UNIFORM, 
                                   MutationType.ADAPTIVE, MutationType.SMART]
            config.mutation_weights = [0.3, 0.2, 0.3, 0.2]
        
        if config.crossover_types is None:
            config.crossover_types = [CrossoverType.SINGLE_POINT, CrossoverType.TWO_POINT,
                                    CrossoverType.UNIFORM, CrossoverType.ADAPTIVE]
            config.crossover_weights = [0.2, 0.2, 0.3, 0.3]
    
    def initialize_population(self, initial_genes: List[Dict[str, Any]]) -> None:
        """初始化种群"""
        self.population = []
        
        for gene in initial_genes:
            individual = Individual(
                gene=deepcopy(gene),
                generation=0,
                age=0
            )
            individual.fitness = self.fitness_function(individual.gene)
            self.population.append(individual)
        
        # 如果初始基因数量不足，随机生成补充
        while len(self.population) < self.config.population_size:
            random_gene = self._generate_random_gene()
            individual = Individual(
                gene=random_gene,
                generation=0,
                age=0
            )
            individual.fitness = self.fitness_function(individual.gene)
            self.population.append(individual)
        
        # 更新最佳个体
        self._update_best_individual()
        self._update_diversity_scores()
    
    def evolve(self) -> Dict[str, Any]:
        """执行进化过程"""
        evolution_log = {
            "generations": [],
            "best_fitness": [],
            "average_fitness": [],
            "diversity": [],
            "mutation_rate_history": [],
            "crossover_rate_history": []
        }
        
        for generation in range(self.config.max_generations):
            self.generation = generation
            
            # 记录当前状态
            avg_fitness = np.mean([ind.fitness for ind in self.population])
            diversity = self._calculate_population_diversity()
            
            evolution_log["generations"].append(generation)
            evolution_log["best_fitness"].append(self.best_individual.fitness)
            evolution_log["average_fitness"].append(avg_fitness)
            evolution_log["diversity"].append(diversity)
            evolution_log["mutation_rate_history"].append(self.mutation_rate)
            evolution_log["crossover_rate_history"].append(self.crossover_rate)
            
            # 检查收敛
            if self._check_convergence():
                print(f"进化在第{generation}代收敛")
                break
            
            # 检查多样性
            if diversity < self.config.diversity_threshold:
                self._inject_diversity()
            
            # 选择
            selected = self._selection()
            
            # 交叉
            offspring = self._crossover(selected)
            
            # 突变
            mutated_offspring = self._mutation(offspring)
            
            # 评估新个体
            for individual in mutated_offspring:
                individual.fitness = self.fitness_function(individual.gene)
                individual.generation = generation + 1
            
            # 形成新一代种群
            self._form_new_generation(mutated_offspring)
            
            # 更新自适应参数
            if self.config.adaptive_mutation or self.config.adaptive_crossover:
                self._update_adaptive_parameters()
            
            # 更新最佳个体和多样性
            self._update_best_individual()
            self._update_diversity_scores()
            
            # 增加年龄
            for individual in self.population:
                individual.age += 1
        
        return evolution_log
    
    def _selection(self) -> List[Individual]:
        """锦标赛选择"""
        selected = []
        
        for _ in range(self.config.population_size):
            tournament = random.sample(self.population, self.config.tournament_size)
            winner = max(tournament, key=lambda x: x.fitness)
            selected.append(deepcopy(winner))
        
        return selected
    
    def _crossover(self, parents: List[Individual]) -> List[Individual]:
        """交叉操作"""
        offspring = []
        
        # 精英保留
        elite_count = int(self.config.population_size * self.config.elitism_rate)
        elite = sorted(self.population, key=lambda x: x.fitness, reverse=True)[:elite_count]
        offspring.extend(deepcopy(elite))
        
        # 交叉生成后代
        while len(offspring) < self.config.population_size:
            if random.random() < self.crossover_rate:
                parent1, parent2 = random.sample(parents, 2)
                child1, child2 = self._perform_crossover(parent1, parent2)
                offspring.extend([child1, child2])
            else:
                # 直接复制
                parent = random.choice(parents)
                child = deepcopy(parent)
                child.parent_ids = [parent.get_gene_id()]
                offspring.append(child)
        
        return offspring[:self.config.population_size]
    
    def _perform_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """执行具体的交叉操作"""
        # 选择交叉类型
        crossover_type = random.choices(
            self.config.crossover_types,
            weights=self.config.crossover_weights
        )[0]
        
        if crossover_type == CrossoverType.SINGLE_POINT:
            return self._single_point_crossover(parent1, parent2)
        elif crossover_type == CrossoverType.TWO_POINT:
            return self._two_point_crossover(parent1, parent2)
        elif crossover_type == CrossoverType.UNIFORM:
            return self._uniform_crossover(parent1, parent2)
        elif crossover_type == CrossoverType.ADAPTIVE:
            return self._adaptive_crossover(parent1, parent2)
        elif crossover_type == CrossoverType.SIMILARITY_BASED:
            return self._similarity_based_crossover(parent1, parent2)
        else:
            return self._uniform_crossover(parent1, parent2)
    
    def _single_point_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """单点交叉"""
        child1 = deepcopy(parent1)
        child2 = deepcopy(parent2)
        
        # 获取参数列表
        params1 = list(parent1.gene.get("parameters", {}).items())
        params2 = list(parent2.gene.get("parameters", {}).items())
        
        if len(params1) > 1:
            # 随机选择交叉点
            crossover_point = random.randint(1, len(params1) - 1)
            
            # 交换参数
            new_params1 = dict(params1[:crossover_point] + params2[crossover_point:])
            new_params2 = dict(params2[:crossover_point] + params1[crossover_point:])
            
            child1.gene["parameters"] = new_params1
            child2.gene["parameters"] = new_params2
        
        child1.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        child2.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        
        return child1, child2
    
    def _two_point_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """两点交叉"""
        child1 = deepcopy(parent1)
        child2 = deepcopy(parent2)
        
        params1 = list(parent1.gene.get("parameters", {}).items())
        params2 = list(parent2.gene.get("parameters", {}).items())
        
        if len(params1) > 2:
            # 选择两个交叉点
            point1 = random.randint(1, len(params1) - 2)
            point2 = random.randint(point1 + 1, len(params1) - 1)
            
            # 交换中间段
            new_params1 = dict(params1[:point1] + params2[point1:point2] + params1[point2:])
            new_params2 = dict(params2[:point1] + params1[point1:point2] + params2[point2:])
            
            child1.gene["parameters"] = new_params1
            child2.gene["parameters"] = new_params2
        
        child1.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        child2.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        
        return child1, child2
    
    def _uniform_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """均匀交叉"""
        child1 = deepcopy(parent1)
        child2 = deepcopy(parent2)
        
        params1 = parent1.gene.get("parameters", {})
        params2 = parent2.gene.get("parameters", {})
        
        new_params1 = {}
        new_params2 = {}
        
        for key in params1:
            if key in params2:
                if random.random() < 0.5:
                    new_params1[key] = params1[key]
                    new_params2[key] = params2[key]
                else:
                    new_params1[key] = params2[key]
                    new_params2[key] = params1[key]
            else:
                new_params1[key] = params1[key]
                new_params2[key] = params1[key]
        
        child1.gene["parameters"] = new_params1
        child2.gene["parameters"] = new_params2
        
        child1.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        child2.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        
        return child1, child2
    
    def _adaptive_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """自适应交叉"""
        # 根据父代适应度差异调整交叉强度
        fitness_diff = abs(parent1.fitness - parent2.fitness)
        avg_fitness = (parent1.fitness + parent2.fitness) / 2
        
        # 适应度差异大时，更多采用均匀交叉
        # 适应度差异小时，更多采用单点交叉
        if fitness_diff > avg_fitness * 0.2:
            return self._uniform_crossover(parent1, parent2)
        else:
            return self._single_point_crossover(parent1, parent2)
    
    def _similarity_based_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """基于相似度的交叉"""
        similarity = self._calculate_gene_similarity(parent1.gene, parent2.gene)
        
        # 相似度高时，采用微调交叉
        if similarity > 0.8:
            return self._fine_tune_crossover(parent1, parent2)
        # 相似度中等时，采用均匀交叉
        elif similarity > 0.5:
            return self._uniform_crossover(parent1, parent2)
        # 相似度低时，采用单点交叉
        else:
            return self._single_point_crossover(parent1, parent2)
    
    def _fine_tune_crossover(self, parent1: Individual, parent2: Individual) -> Tuple[Individual, Individual]:
        """微调交叉（用于相似度高的父代）"""
        child1 = deepcopy(parent1)
        child2 = deepcopy(parent2)
        
        params1 = parent1.gene.get("parameters", {})
        params2 = parent2.gene.get("parameters", {})
        
        new_params1 = {}
        new_params2 = {}
        
        for key in params1:
            if key in params2 and isinstance(params1[key], (int, float)) and isinstance(params2[key], (int, float)):
                # 数值型参数：取加权平均
                weight = random.random()
                new_params1[key] = weight * params1[key] + (1 - weight) * params2[key]
                new_params2[key] = (1 - weight) * params1[key] + weight * params2[key]
            else:
                # 非数值型参数：随机选择
                if random.random() < 0.5:
                    new_params1[key] = params1[key]
                    new_params2[key] = params2[key]
                else:
                    new_params1[key] = params2[key]
                    new_params2[key] = params1[key]
        
        child1.gene["parameters"] = new_params1
        child2.gene["parameters"] = new_params2
        
        child1.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        child2.parent_ids = [parent1.get_gene_id(), parent2.get_gene_id()]
        
        return child1, child2
    
    def _mutation(self, individuals: List[Individual]) -> List[Individual]:
        """突变操作"""
        mutated = []
        
        for individual in individuals:
            if random.random() < self.mutation_rate:
                mutated_individual = self._perform_mutation(individual)
                mutated.append(mutated_individual)
            else:
                mutated.append(individual)
        
        return mutated
    
    def _perform_mutation(self, individual: Individual) -> Individual:
        """执行具体的突变操作"""
        # 选择突变类型
        mutation_type = random.choices(
            self.config.mutation_types,
            weights=self.config.mutation_weights
        )[0]
        
        if mutation_type == MutationType.GAUSSIAN:
            return self._gaussian_mutation(individual)
        elif mutation_type == MutationType.UNIFORM:
            return self._uniform_mutation(individual)
        elif mutation_type == MutationType.ADAPTIVE:
            return self._adaptive_mutation(individual)
        elif mutation_type == MutationType.SMART:
            return self._smart_mutation(individual)
        elif mutation_type == MutationType.TARGETED:
            return self._targeted_mutation(individual)
        else:
            return self._gaussian_mutation(individual)
    
    def _gaussian_mutation(self, individual: Individual) -> Individual:
        """高斯突变"""
        mutated = deepcopy(individual)
        params = mutated.gene.get("parameters", {})
        
        for key, value in params.items():
            if isinstance(value, (int, float)):
                # 添加高斯噪声
                noise = np.random.normal(0, 0.1 * abs(value) if value != 0 else 0.1)
                new_value = value + noise
                
                # 确保值在合理范围内
                if isinstance(value, int):
                    mutated.gene["parameters"][key] = int(round(new_value))
                else:
                    mutated.gene["parameters"][key] = new_value
        
        mutated.mutation_history.append("gaussian")
        return mutated
    
    def _uniform_mutation(self, individual: Individual) -> Individual:
        """均匀突变"""
        mutated = deepcopy(individual)
        params = mutated.gene.get("parameters", {})
        
        # 随机选择一个参数进行突变
        if params:
            key = random.choice(list(params.keys()))
            value = params[key]
            
            if isinstance(value, (int, float)):
                # 在原值附近随机选择新值
                if isinstance(value, int):
                    new_value = random.randint(int(value * 0.8), int(value * 1.2))
                else:
                    new_value = random.uniform(value * 0.8, value * 1.2)
                mutated.gene["parameters"][key] = new_value
            elif isinstance(value, bool):
                mutated.gene["parameters"][key] = not value
        
        mutated.mutation_history.append("uniform")
        return mutated
    
    def _adaptive_mutation(self, individual: Individual) -> Individual:
        """自适应突变"""
        # 根据个体适应度调整突变强度
        if self.best_individual:
            fitness_ratio = individual.fitness / max(self.best_individual.fitness, 1e-6)
        else:
            fitness_ratio = 1.0
        
        # 适应度低的个体突变强度更大
        mutation_strength = max(0.05, 0.2 * (1.0 - fitness_ratio))
        
        mutated = deepcopy(individual)
        params = mutated.gene.get("parameters", {})
        
        for key, value in params.items():
            if isinstance(value, (int, float)):
                noise = np.random.normal(0, mutation_strength * abs(value) if value != 0 else mutation_strength)
                new_value = value + noise
                
                if isinstance(value, int):
                    mutated.gene["parameters"][key] = int(round(new_value))
                else:
                    mutated.gene["parameters"][key] = new_value
        
        mutated.mutation_history.append("adaptive")
        return mutated
    
    def _smart_mutation(self, individual: Individual) -> Individual:
        """智能突变"""
        mutated = deepcopy(individual)
        params = mutated.gene.get("parameters", {})
        
        # 分析参数重要性，优先突变重要参数
        important_params = ["position_size", "stop_loss", "take_profit", "holding_period"]
        
        for param in important_params:
            if param in params:
                value = params[param]
                if isinstance(value, (int, float)):
                    # 根据参数类型采用不同的突变策略
                    if param == "position_size":
                        # 仓位大小：小幅调整
                        noise = np.random.normal(0, 0.05)
                        new_value = max(0.1, min(1.0, value + noise))
                    elif param in ["stop_loss", "take_profit"]:
                        # 止损止盈：中等幅度调整
                        noise = np.random.normal(0, 0.1)
                        new_value = max(0.01, min(0.5, abs(value + noise)))
                    else:
                        # 其他参数：标准调整
                        noise = np.random.normal(0, 0.1 * abs(value) if value != 0 else 0.1)
                        new_value = value + noise
                    
                    if isinstance(value, int):
                        mutated.gene["parameters"][param] = int(round(new_value))
                    else:
                        mutated.gene["parameters"][param] = new_value
        
        mutated.mutation_history.append("smart")
        return mutated
    
    def _targeted_mutation(self, individual: Individual) -> Individual:
        """目标突变"""
        # 基于历史表现选择突变目标
        mutated = deepcopy(individual)
        params = mutated.gene.get("parameters", {})
        
        # 如果个体适应度较低，重点突变风险相关参数
        if self.best_individual and individual.fitness < self.best_individual.fitness * 0.8:
            risk_params = ["stop_loss", "position_size", "take_profit"]
            target_params = [p for p in risk_params if p in params]
        else:
            target_params = list(params.keys())
        
        if target_params:
            # 随机选择1-2个目标参数进行突变
            num_mutations = min(2, len(target_params))
            selected_params = random.sample(target_params, num_mutations)
            
            for param in selected_params:
                value = params[param]
                if isinstance(value, (int, float)):
                    # 较大幅度的突变
                    noise = np.random.normal(0, 0.2 * abs(value) if value != 0 else 0.2)
                    new_value = value + noise
                    
                    if isinstance(value, int):
                        mutated.gene["parameters"][param] = int(round(new_value))
                    else:
                        mutated.gene["parameters"][param] = new_value
        
        mutated.mutation_history.append("targeted")
        return mutated
    
    def _form_new_generation(self, offspring: List[Individual]) -> None:
        """形成新一代种群"""
        # 合并父代和子代
        combined_population = self.population + offspring
        
        # 按适应度排序
        combined_population.sort(key=lambda x: x.fitness, reverse=True)
        
        # 选择最优的个体组成新一代
        self.population = combined_population[:self.config.population_size]
    
    def _update_best_individual(self) -> None:
        """更新最佳个体"""
        if self.population:
            current_best = max(self.population, key=lambda x: x.fitness)
            if self.best_individual is None or current_best.fitness > self.best_individual.fitness:
                self.best_individual = deepcopy(current_best)
    
    def _update_diversity_scores(self) -> None:
        """更新多样性评分"""
        for individual in self.population:
            individual.diversity_score = self._calculate_individual_diversity(individual)
    
    def _calculate_population_diversity(self) -> float:
        """计算种群多样性"""
        if len(self.population) < 2:
            return 0.0
        
        total_similarity = 0.0
        count = 0
        
        for i in range(len(self.population)):
            for j in range(i + 1, len(self.population)):
                similarity = self._calculate_gene_similarity(
                    self.population[i].gene, 
                    self.population[j].gene
                )
                total_similarity += similarity
                count += 1
        
        if count == 0:
            return 0.0
        
        avg_similarity = total_similarity / count
        diversity = 1.0 - avg_similarity
        
        return diversity
    
    def _calculate_individual_diversity(self, individual: Individual) -> float:
        """计算个体多样性"""
        if len(self.population) < 2:
            return 0.0
        
        similarities = []
        for other in self.population:
            if other != individual:
                similarity = self._calculate_gene_similarity(individual.gene, other.gene)
                similarities.append(similarity)
        
        if similarities:
            avg_similarity = np.mean(similarities)
            return 1.0 - avg_similarity
        
        return 0.0
    
    def _calculate_gene_similarity(self, gene1: Dict[str, Any], gene2: Dict[str, Any]) -> float:
        """计算基因相似度"""
        # 模板相似度
        template_similarity = 1.0 if gene1.get("template_id") == gene2.get("template_id") else 0.0
        
        # 参数相似度
        params1 = gene1.get("parameters", {})
        params2 = gene2.get("parameters", {})
        
        if not params1 and not params2:
            param_similarity = 1.0
        elif not params1 or not params2:
            param_similarity = 0.0
        else:
            common_keys = set(params1.keys()) & set(params2.keys())
            if not common_keys:
                param_similarity = 0.0
            else:
                similarities = []
                for key in common_keys:
                    val1, val2 = params1[key], params2[key]
                    if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                        if val1 == 0 and val2 == 0:
                            sim = 1.0
                        else:
                            sim = 1.0 - abs(val1 - val2) / max(abs(val1), abs(val2), 1e-6)
                        similarities.append(sim)
                    elif val1 == val2:
                        similarities.append(1.0)
                    else:
                        similarities.append(0.0)
                
                param_similarity = np.mean(similarities) if similarities else 0.0
        
        # 加权平均
        overall_similarity = 0.3 * template_similarity + 0.7 * param_similarity
        
        return overall_similarity
    
    def _check_convergence(self) -> bool:
        """检查是否收敛"""
        if len(self.fitness_history) < 10:
            return False
        
        recent_fitness = self.fitness_history[-10:]
        fitness_std = np.std(recent_fitness)
        
        return fitness_std < self.config.convergence_threshold
    
    def _inject_diversity(self) -> None:
        """注入多样性"""
        # 随机替换一些个体为新的随机个体
        num_replacements = int(self.config.population_size * 0.2)
        
        for _ in range(num_replacements):
            random_gene = self._generate_random_gene()
            new_individual = Individual(
                gene=random_gene,
                generation=self.generation,
                age=0
            )
            new_individual.fitness = self.fitness_function(new_individual.gene)
            
            # 替换最差的个体
            worst_index = min(range(len(self.population)), 
                            key=lambda i: self.population[i].fitness)
            self.population[worst_index] = new_individual
    
    def _update_adaptive_parameters(self) -> None:
        """更新自适应参数"""
        if len(self.fitness_history) < 5:
            return
        
        # 计算最近的改进情况
        recent_improvement = self.fitness_history[-1] - self.fitness_history[-5]
        
        # 如果改进缓慢，增加突变率
        if recent_improvement < self.config.convergence_threshold:
            self.mutation_rate = min(0.3, self.mutation_rate * 1.1)
        else:
            self.mutation_rate = max(0.05, self.mutation_rate * 0.95)
        
        # 根据多样性调整交叉率
        current_diversity = self.diversity_history[-1] if self.diversity_history else 0.5
        if current_diversity < self.config.diversity_threshold:
            self.crossover_rate = min(0.95, self.crossover_rate * 1.05)
        else:
            self.crossover_rate = max(0.6, self.crossover_rate * 0.98)
    
    def _generate_random_gene(self) -> Dict[str, Any]:
        """生成随机基因（需要与策略模板库集成）"""
        # 这里应该调用策略模板库来生成
        # 暂时返回一个简单的随机基因
        return {
            "template_id": "dual_ma",
            "template_name": "双均线策略",
            "category": "technical",
            "parameters": {
                "fast_period": random.randint(5, 15),
                "slow_period": random.randint(20, 40),
                "signal_threshold": random.uniform(0.01, 0.03),
                "position_size": random.uniform(0.3, 0.7)
            },
            "gene_structure": {
                "signal_type": "ma_crossover",
                "indicators": ["sma", "ema"],
                "conditions": ["golden_cross", "death_cross"],
                "risk_management": ["stop_loss", "position_sizing"]
            },
            "complexity_score": 0.3,
            "risk_level": "low",
            "a_share_compatible": True,
            "generation_method": "random"
        }
    
    def get_evolution_summary(self) -> Dict[str, Any]:
        """获取进化总结"""
        if not self.population:
            return {}
        
        fitnesses = [ind.fitness for ind in self.population]
        
        return {
            "generation": self.generation,
            "population_size": len(self.population),
            "best_fitness": max(fitnesses),
            "average_fitness": np.mean(fitnesses),
            "fitness_std": np.std(fitnesses),
            "diversity": self._calculate_population_diversity(),
            "best_individual": {
                "gene_id": self.best_individual.get_gene_id(),
                "fitness": self.best_individual.fitness,
                "generation": self.best_individual.generation,
                "age": self.best_individual.age,
                "mutation_history": self.best_individual.mutation_history
            } if self.best_individual else None,
            "mutation_rate": self.mutation_rate,
            "crossover_rate": self.crossover_rate
        }