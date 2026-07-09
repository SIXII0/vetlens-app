<script lang="ts">let _=1;</script>
<div class="max-w-4xl mx-auto space-y-6 animate-enter">
  <a href="/knowledge" class="text-sm text-warm-400 hover:text-brand-600">← 知识库首页</a>
  <h1 class="text-2xl font-extrabold text-warm-900">💟 宠物护理指南</h1>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each [
      {t:'新宠到家',d:'迎接新成员的准备清单和适应期指南',i:'🏠'},
      {t:'营养与喂养',d:'不同生命阶段的营养需求和喂食建议',i:'🍖'},
      {t:'日常护理',d:'梳毛、洗澡、剪指甲、刷牙等日常护理',i:'🛁'},
      {t:'老年护理',d:'老年宠物的特殊需求和常见问题',i:'👴'},
      {t:'旅行与寄养',d:'带宠物出行和寄养的注意事项',i:'✈️'},
      {t:'急救处理',d:'常见意外的紧急处理方法',i:'🚑'},
    ] as g}
      <div class="card hover:shadow-raised transition-all cursor-pointer">
        <span class="text-2xl">{g.i}</span>
        <h3 class="font-semibold text-warm-900 mt-2">{g.t}</h3>
        <p class="text-sm text-warm-500 mt-1">{g.d}</p>
      </div>
    {/each}
  </div>
  <div class="card text-center py-12 text-warm-400">护理指南内容建设中，敬请期待</div>
</div>
