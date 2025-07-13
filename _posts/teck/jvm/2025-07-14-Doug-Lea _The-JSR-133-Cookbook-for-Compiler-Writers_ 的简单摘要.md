---
tiile: Doug Lea :<The JSR-133 Cookbook for Compiler Writers> 的简单摘要

---
> 原文链接：  [The JSR-133 Cookbook for Compiler Writers](http://gee.cs.oswego.edu/dl/jmm/cookbook.html)  
[JSR 133 (Java Memory Model) FAQ](http://www.cs.umd.edu/~pugh/java/memoryModel/jsr-133-faq.html)  
参考翻译：  
[Doug Lea并发编程文章全部译文](http://ifeve.com/doug-lea/)  
[JMM Cookbook(一)指令重排](http://ifeve.com/jmm-cookbook-reorderings/)  
[国内链接原文对照翻译](https://yellowstar5.cn/direct/The%20JSR-133%20Cookbook-chinese.html)
>

# 1. 重排序 Reorderings
对于`编译器`来说，`JMM`主要包含禁止对字段访问` access fields`（其中"字段"包含数据元素 array elements）以及监视器 `monitors`（锁 locks）的某些指令进行`重排序`的规则。

## 1.1 Volatile 和 Monitor
`volatile` 和 `monitor` 的主要JMM规则可以看作一个矩阵，其中单元格指示无法重新排序与特定字节码关联的指令。该表本身不是JMM规范：它只是查看其对编译器 `compilers` 和运行时系统 `runtime systems`主要影响的一种有效方式  
![](https://cdn.nlark.com/yuque/0/2025/png/3007874/1752283311949-a0cfd603-5261-4895-b99b-1ad53089b6cb.png)  
注：

+ `Normal Loads` 是对`非volatile` 字段的 `getfield` ，`getstatic` ， `array load`  。
+ `Normal Stores` 是对`非volatile` 字段的 `setfield` ，`setstatic` ， `array store`  。
+ `Volatile Loads` 是 多线程可访问的 `volatile` 字段的 `getfield` ，`getstatic `。
+ `Volatile Stores` 是 多线程可访问的 `volatile` 字段的 `setfield` ，`setstatic `。
+ `MonitorEnters`(包括`进入synchronized`方法) 用于多线程可访问的锁对象 `lock objects` 。
+ `MonitorExits`（包括`退出synchronized`方法）用于多线程可访问的锁对象 `lock objects` 。

这里 Normal Load 于 Normal Store 相同，Volatile Load 与 MonitorEnter 相同，Volatile Store 与 MonitorExit 相同，这里只考虑作为原子单元 atomic unit 可读与可写的变量。

表中第1个操作与第2个操作中间可能任意数量的其他操作，所以例如表中[Normal Store,Volatile Store]中的 **[No]** 表示 Normal Store 不能与任何后续的 Volatile Store 进行重排序，至少是任何能对多线程程序语义有影响的重排序。

JSR-133规范的措辞使得`volatiles` 和 `monitors` 的规则 仅适用于可能被`多线程访问`的场景。如果编译器能够以某种方式证明lock只能被`单个线程访问`，那么这个lock可能会被`优化`。同样如果只被单线程访问的`volatile`字段可以充当普通字段 `normal field`。更细粒度的分析和优化也是有可能的，例如：那些被证明仅在特定时间间隔内不可被多线程访问的分析和优化。

表中空白单元格表示如果访问不依赖于基础Java语义，则`允许重排序`。例如，即使表格没有说，也**不能**对`同一个内存地址`的`load`和后续的`store`进行重排序。但是可以对两个不同内存地址上的load和store进行重排序，并且可能希望各种编译器转换和优化过程中这样做。这包括通常不被认为是重排序的情况；例如：基于已加载 loaded 的字段重用计算值，而不是重新加载reload和重新计算 recomputing 该值作为重排序。但是，JMM规范允许进行转换以消除可避免的依赖关系，进而允许重排序。

所有情况下，允许的重排序必须保持最小的`Java安全属性`，即使当访问access被程序员错误的同步：所有观察到的 observed 字段值 values 必须是默认的 `zero/null` "预构造 pre-constraction"值，，或某个线程编写的值。这通常需要在 对象的堆内 `heap memory` 被构造函数 `constructors` 使用之前归零 `zeroing` 它，并且**永远不会**对 归零存储`zeroing stores` 和其他 `load` 重排序  。一个很好的方法就是在`垃圾收集器`中将回收的内存归零。

这里描述的规则 rules 和 属性 properties 用应于访问Java级别 `Java-Level `字段。在实践中，这些将另外与访问内部簿记字段 `internal bookkeeping fields`和数据 `data`的访问进行交互。例如：对象头 `object headers`,GC表 `GC table`，和`动态生成的代码` 。

## 1.2 Final 字段 Final Field
`final`字段的 Load和Store相对于 locks 和volatiles 而言是 "正常"的访问 "normal" accesses，但是增加了两个额外的重排序规则：

1. `final字段`（`在构造器内部`）的`store`，如果该字段是引用 `reference`，任何这个final能引用到的`store`，都不能与对持有该字段的对象的引用的后续存储（`在该构造函数外部`）重新排序到其他线程可以访问的变量  
   例如：不能重排序  
   x.finalField = v; ... ; sharedRef = x;  
   当内联构造函数 inlining constructors时，这就会发挥作用，其中"..."跨越构造函数的逻辑端。不能将final 字段的store下移到构造函数外部的store之下，这可能使得对象对其他线程可见。  
   （如下所示，这里可能还需要发布屏障 barrier ）。同样，不能对前两个中的任何一个与第三个store 重新排序。  
   v.afield = 1; x.finalField = v; ... ; sharedRef = x;
2. `final`字段的初始加载  `initial load`（即线程第一次遇到）不能对包含`final`字段的对象的`引用`初始加载重排序。这在以下方面起作用：  
   x = sharedRef; ... ; i = x.finalField;  
   编译器永远不会重新排序这些，因为它们是依赖的，但是这个规则可能会对某些处理器产生影响。

这些规则意味着Java程序员对final字段的可靠使用对具有final字段的对象的共享引用 shared reference 的 load 本身是 synchronized，volatile，或final，或从这种load中派生出来的，因此最终将initialing stores排序在构造函数，随后在构造函数之外使用。

# 2 内存屏障 Memory Barriers
编译器和处理器都必须遵守重排序规则，不需要特别努力来保证`单处理器`保持正确的顺序，因为他们都保证`as-if-sequential`一致性。但在`多处理器上`，保证一致性通常需要发出屏障指令  `barrier instructions`，即使编译器优化了字段访问（例如因为 loaded value 未使用），仍必须生成 barriers ，就好像访问仍然存在一样。（见下文关于独立优化barriers内容）。

内存屏障 `memory barriers` 仅与内存模型 `memory model` 中描述的高级 `higher-level`概念（例如： 获取 `acquire` ，释放 `release`）间接相关。并且memory barriers 本身并不是"同步屏障 synchronized barriers"，并且memory barriers 与某些垃圾收集器中的使用的"写屏障 write barriers"类型 无关。内存屏障指令 `memory barriers instructions`仅直接控制`CPU与其缓存`的交互。其写入缓存区 write-buffer 保存等待刷新到内存 memory 的 store，and/or 其等待 load 或推测执行指令的缓冲区 buffer。这些影响可能导致高速缓存 `cache`，主内存 `main memory` 和其他处理器 `processors` 之间的进一步交互。但是，只要stores最终成为全局执行，JMM中没有任何东西要求夸处理器进行任何特定形式的通信。例如：所有处理器可见 ，并且当这些数据可见时可以加载loads （retrieve）它们。

## 2.1 类别 Categories
几乎所有处理器都支持粗粒度屏障指令，通常称为"栅栏 Fence"，它保证在栅栏`Fence之前`启动的所有`loads`和`stores`将严格排序在栅栏`Fence之后`启动的任何`loads`或`stores`之前。这通常是任何给定处理器上最耗时 time-consuming 的指令之一（通常几乎与原子指令 atomic instructions 一样，甚至更昂贵）。大多数处理器processors还支持更细粒度的barriers。

需要一些时间来适应的是`memory barriers` 的一个属性是它应用于内存之间的访问 `memory accesses`。尽管某些处理器上给出了 内存指令 barriers instructions 的名称，但是使用的 正确/最佳 barrier 是取决于它分离的访问类型。这是屏障类型 barrier types 最常见的分类，可以很好的映射到现有处理器的特定指令  specific instructions（有时是 no-ops）

1. **LoadLoad Barriers**：  
   顺序：load1 ; LoadLoad ; load2  
   确保 `load2` 和后续所有加载 `load` 指令访问数据**之前**加载 loaded `load1 `的数据。通常，在执行推测加载 speculative loads and/or 和/或等待加载指令 waiting load 可以绕过等待存储 waiting store 的无序处理out-of-order processing 的处理器上需要显式LoadLoad barriers。在始终保持加载顺序 load  ordering的处理器上，相当于无操作no-ops。
2. **StoreStore Barriers**  
   顺序：store1 ；StoreStore ； store2  
   确保 `store1` 的数据在与 `store2` 和所有后续store指令关联的数据之前对**其他处理器可见**（即刷新到内存 `flushed to memory`）。通常，在不能保证从 写入缓存区 write buffer 和/或 缓存 向其他处理器或主内存 main memory 中严格按照顺序刷新 flushes 的处理器上需要StoreStore Barriers。
3. **LoadStore Barriers**  
   顺序：load1 ；LoadStore ； store2  
   确保 与 `store2` 和后续`store`指令关联的所有数据被刷新 `flushed` 之前 加载 loaded `load1`的数据。只有在那些等待 waiting store 指令可以绕过 加载load 的乱序 out-of-order 处理器上才需要 LoadStore Barries。
4. **StoreLoad Barriers**  
   顺序：store1 ; StoreLoad ; load2  
   确保：`store1` 的数据在 `load2` 和后续所有加载load指令被加载loaded之前**对其他处理器可见**（即刷新到主内存 `flushed to main memory`）。StoreLoad Barriers 可以防止后续 load 错误使用store1 的数据值，而不是从最新的由不同处理器存储store到相同内存位置的数据。因此，在下面讨论的处理器上，StoreLoad 仅在用于分离存储stores 和在屏蔽barriers之前存储的stored相同位置location(s)的后续加载loads时是严格必须的。几乎所有最近的多处理器multiprocessors都需要StoreLoad Barriers，并且通常是最昂贵的一种。它昂贵的部分原因是它必须禁用 通常绕过缓存 cache 直接从写缓冲区write-buffers 加载loads的机制。这可以通过让缓冲区完全刷新 `buffer full flush` ，或其他可能的停顿`stalls` 来实现。

在下面讨论的所有处理器上，**事实证明执行StoreLoad 的指令也会获取其他三个屏障效果**，因此 StoreLoad可以作为通用（但通常很昂贵）Fence。（这是一个经验事实，不是必须的）。反之则不成立。通常情况下发布任何其他Barriers组合都不会产生相当于StoreLoad Barriers 的效果。

下表显示了这些barriers如何对应JSR-133排序规则  
![](https://cdn.nlark.com/yuque/0/2025/png/3007874/1752283311893-22286476-8ed5-4fa9-ac35-bb1915d90e85.png)

final-field 的特殊规则需要加上 StoreLoad Barroers：  
x.finalField = v; StoreStore; sharedRef = x;

这里有一个表明展示位置的示例：  
![](https://cdn.nlark.com/yuque/0/2025/png/3007874/1752283311852-c48afafa-4d60-4114-b074-779362fe26b9.png)

## 2.2 数据依赖和屏障 Data Dependency and Barriers
某些处理器上对与`LoadLoad` 和 `LoadStore` barriers 的需要与它们对相关指令的**排序保证**相互作用。在某些（大多数）处理器上，依赖于先前加载 previous load 的值 的 load 或 store 由**处理器排序，而不需要显示的屏障**。这通常出现在两种情况下，

+ 间接 `indirection`：Load x; Load x.field
+ 条件控制 `control`：Load x; if (predicate(x)) Load or Store y; predicate 谓词、断言

不尊重间接顺序 indirection ordering 的处理器，尤其需要对最初通过共享引用 shared references 获取引用的final字段 的访问屏障  
x = sharedRef; ... ; LoadLoad; i = x.finalField;  
反之，如下所述，确实尊数据依赖 data dependencies关系的处理器提供一些机会来优化掉 LoadLoad 和 LoadStore barriers 指令，否则这些指令需要发出。（但是，依赖关系dependency 不会消除任何处理器上对StoreLoad barriers 的需求）。

## 2.3 与原子指令的交互 Interactions with Atomic Instructions
不同处理器上所需要的各种类型 barriers 还需要与`MonitorEnter`和`MonitorExit`的实现交互。`locking` and/or `unlocking`通常需要使用**原子条件更新**操作 CompareAndSwap（`CAS`）或LoadLinked/StoreConditional（`LL/SC`）这些操作具有`performing a volatile load followed by a volatile store `的语义。虽然 CAS或LL/SC的最低限度就够了，但某些处理器还支持其他原子指令 atomic instructions（例如：无条件交换  unconditional exchange），这些指令有时可以代替或 与原子条件更新 atomic conditional updates 结合使用 。

在所有处理器上，原子操作 `atomic operations` 可以防止正在被 read/update 的内存位置 `locations` 的 `写后读 read-after-write` 问题。（否则标准的 loop-until-success 将无法以所需要的方式工作）。但是处理器的区别在于原子操作 atomic operations 是否为其目标内存地址提供比隐式StoreLoad更通用的 屏障属性 barriers properties。在某些处理器上，这些指令 instructions 本质上执行 `MonitorEnter/Exit` 所需的barriers；在其处理器，这些barriers需要部分或全部专门发布 specifically issued。  
Volatiles和Monitors必须分开以区分这些影响，给出：  
![](https://cdn.nlark.com/yuque/0/2025/png/3007874/1752283311828-e58c0907-2a0b-4d31-af29-b17d25dfe8ed.png)  
final-field的特殊规则需要加上 StoreStore barriers  
x.finalField = v; StoreStore; sharedRef = x;  
此表中 "Enter" 和 "Load" 相同，"Exit" 和 "Store" 相同，除非被原子指令的使用和性质覆盖。特别是：

+ 进入任何执行load的 synchronized block/method 都需要 **EnterLoad**。它与 **LoadLoad** 相同，除非在MonitorEnter中使用了原子指令，并且它本身提供了至少具有**LoadLoad**属性的barriers，在这种情况下它是no-ops。
+ 退出任何执行store的 synchronized block/method 都需要 **StoreExit**。它与 **StoreStore** 相同，除非在MonitorExit中使用了原子指令，并且它本身提供了至少具有**StoreStore**属性的barriers，在这种情况下它是no-ops。
+ **ExitEnter**和**StoreLoad**是相同的，除非在MonitorEnter and/or MonitorExit中使用了原子指令，并且其中至少一个提供了至少具有**StoreLoad**属性的barriers，这种情况下它是no-ops。

其他类型不太可能在编译中发挥作用（见下文）and/or 在当前处理器减小到 no-ops。例如，当中间没有load或store时，需要**EnterEnter**来分隔嵌套的MonitorEnters。下面示例展示了大多数类型的放置位置。  
![](https://cdn.nlark.com/yuque/0/2025/png/3007874/1752283312012-2e2cff55-fe8e-4ce1-83ab-b3f066589572.png)  
JDK1.5中将通过JSR-166（concurrency utilities）提供对原子条件更新操作 atomic conditional update operations Java级访问。因此编译器compliers将需要使用上表的变体来发布相关代码，该变体从语义上折叠了 MonitorEnter和MonitorExit，有时在实践中，这些Java级别的原子更新就像被锁locks包围一样。

=====  
TODO waiting

# 3. 多处理器 Multiprocessors
# 4. 指南 Recipes
## 4.1 单处理器 Uniprocessors
如果能够保证生成的代码只能在单处理器上运行，那么可以跳过本节的其余部分。因为`单处理器`保持着明显的`顺序一致性`，除非对象内存以某种方式与可异步访问的IO内存共享，否则永远都不需要发出barroers。这可能发生在特殊映射的 java.io buffers,但可能仅影响内部JVM支持代码，而不是Java代码，可以想象，如果上下文切换时不包含足够的同步时，则需要一些特殊的barriers。

## 4.2 插入屏障 Inserting Barriers
`barriers instructions`适用于程序运行期间发生的不同类型的访问 accesses。找到一个执行barriers总数最小的"最佳"位置几乎是不可能的。编译器compilers通常无法判断一个给定 load/store是在另一个需要barriers的 load/store 指令的之前 或 之后。例如，当一个volatile store 后面跟着一个return时。最**简单的保守策略**是 假设在为任何给定的load/store/lock/unlock 访问生成代码时，需要"最重"的barriers。

1. 每个`Volatile Store` **之前**插入一个`StoreStore` barriers（在 ia64 你必须将该指令和大多数barriers合并成相应的load或store）。
2. 每个`Volatile Store` **之后**插入一个`StoreLoad` barriers。  
   注意，虽然也可以在每个Volatile Load 之前插入一个StoreLoad barriers，但是对于典型的程序来说会更慢，因为reads远远大于writes。或者，如果可用，可以将volatile store 实现为atomci instruction（例如 x86上的XCHG）并省略barriers。如果atomic instruction 比 StoreLoad更廉价，这可能更有效。
3. 在每个`Volatile Load `**之后**插入 `LoadLoad`和`LoadStore` barriers。  
   在保留数据依赖排序的处理器上，如果下一条访问指令 access instruction 依赖于这个volatile load的值，则无需发出屏障 issue barrier。特别是，如果load一个volatile 引用之后，如果后续指令是null-check或load这个引用的字段，则不需要barriers。
4. 在每一个  `MonitorEnter`**之前**  或  `MonitorExit`**之后**  插入一个`ExitEnter` barrier（根据上面讨论，如果`MonitorEnter`或`MonitorExit`使用能够提供等效于`StoreLoad` barrier的`atomic instruction`，则`ExitEnter`是`no-ops`，其他步骤中，涉及到Enter和Exit 也是如此）。
5. 在每个`MonitorEnter`**之后**插入`EnterLoad`和`EnterStore` barriers。
6. 在每个`MonitorExit`**之前**插入`StoreExit`和`LoadExit`。
7. 任何包含`final`字段的class，所有构造函数在全部的store之后，`return`**之前**需要插入`StoreStore` barriers。
8. 如果在本质上不支持间接加载 `indirect loads` 顺序的处理器上，每个`final`字段加载**之前**需要插入`LoadLoad` barrier。

这些barriers中一些通常被简化为no-ops。实际上它们大多数简化为no-ops，但是在不同处理器 processors和锁模式locking schedule 下的方式不同。对于最简单的示例， JSR-133 的 基本一致性在x86或sparc-TSO平台上使用CAS实现locking 时，仅需要在volatile store后插入一个 StoreLoad barriers。

## 4.3 移除屏障 Removing Barriers
上面的保守策略对很多程序来说也许还能接受。`volatile`的主要性能问题出现在与`store`关联的`StoreLoad` barres上，这些应该是相对少见的--在并发程序中使用volatile的主要原因是避免在reads时使用locks，这只是在reads远远大于writes才会出现的问题。但至少可以通过以下方式改进这一策略：

+ 消除多余的障碍。可以根据前面章节的表格内容，可以通过以下方式消除障碍：![](https://cdn.nlark.com/yuque/0/2025/png/3007874/1752283312333-2e36dc2c-fc3e-4d3e-8bcc-35a049852e7d.png) 类似的屏障消除也可用于锁locks的交互，但要依赖于锁locks的实现方式。 在存在循环、调用和分支的情况下执行所有这些操作就留给读者作为练习。:-)
+ 重排代码 Rearranging code （在约束允许的范围内），以进一步消除 LoadLoad和LoadStore barriers，因为处理器维持了数据依赖 data dependencies 顺序。
+ 移动指令流中屏障的位置以提高调度(scheduling)效率，只要在该屏障被需要的时间内最终仍会在某处执行即可。
+ 移除那些没有多线程依赖而不需要的屏障；例如，某个volatile变量被证实只会对单个线程可见。而且，如果能证明线程仅能对某些特定字段执行store指令或仅能执行load指令，则可以移除这里面使用的屏障。但是所有这些通常都需要作大量的分析。

## 4.4 杂记 Miscellany
`JSR-133`也讨论了在更为特殊的情况下可能需要屏障的其它几个问题：

+ `Thread.start()` 需要barriers确保启动的线程在调用点`call point` 看到调用者`caller` 所有的`stores`可见。相反，`Thread.join()`需要barriers 以确保调用者 `caller` 看到终止线程的所有存储 `stores`。这些barriers 通常是由这些 `Thread.start()/Thread.join()`结构中的实现所需要的同步生成的。
+ `static final` 初始化需要`StoreStore` barriers，这些barriers通常包含在遵守Java class 加载 loading、初始化 initialization 的机制中。
+ 取保默认的`0/null` 初始字段值，通常需要 barriers，synchronization，and/or 垃圾收集器内部low-level 缓存控制。
+ 在构造器contractions 之外或静态初始化器 static initializers 之外神秘设置System.in, System.out和System.err的JVM私有例程需要特别注意，因为它们是JMM final字段规则的遗留的例外情况。
+ 类似地，`JVM`内部反序列化设置`final`字段的代码通常需要一个`StoreStore`屏障。
+ 终结方法`Finalization` 的支持可能需要barriers（在垃圾收集器内）以确保`Object.finalize()` 代码在在对象变为`unreferenced` 之前看到所有字段所有`stores`。这通常通过用于在引用队列reference queues 中添加和删除引用 reference 的同步synchronization 来确保。
+ 调用JNI例程以及从JNI例程中返回可能需要barriers，尽管这看起来是实现方面的一些问题。
+ 大多数处理器都有其他同步指令synchronizing instructions，主要设计用于 IO 和 OS 操作actions。这些不会直接影响 JMM 问题，但可能涉及 IO、类加载class loading 和动态代码生成dynamic code generation。

