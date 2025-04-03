import{_ as i,c as e,a,o as n}from"./app-Cs1HD44n.js";const t="/yw-docs/assets/union-fs-D17sM0BL.png",l="/yw-docs/assets/diff-rootfs-BlONGkJU.png",o="/yw-docs/assets/image-layering-CyltU--q.png",p="/yw-docs/assets/container-layer-C_ndH-fB.png",r={};function h(d,s){return n(),e("div",null,s[0]||(s[0]=[a('<h3 id="镜像本质" tabindex="-1"><a class="header-anchor" href="#镜像本质"><span>镜像本质</span></a></h3><p>什么是镜像： 是一种轻量级、可执行的独立软件包，它包含运行某个软件所需的所有内容，我们把应用程序和配置依赖打包好形成一个可交付的运行环境(包括代码、运行时需要的库、环境变量和配置文件等)，这个打包好的运行环境就是image镜像文件。只有通过这个镜像文件才能生成Docker容器实例。</p><h4 id="镜像分层" tabindex="-1"><a class="header-anchor" href="#镜像分层"><span>镜像分层</span></a></h4><p>以我们的pull为例，在下载的过程中我们可以看到docker的镜像好像是在一层一层的在下载。</p><h3 id="联合文件系统" tabindex="-1"><a class="header-anchor" href="#联合文件系统"><span>联合文件系统</span></a></h3><p>Docker 最早支持的stotage driver是 AUFS，它实际上由一层一层的文件系统组成，这种层级的文件系统叫UnionFS。</p><p>UnionFS（联合文件系统）：Union文件系统（UnionFS）是一种分层、轻量级并且高性能的文件系统，它支持对文件系统的修改作为一次提交来一层层的叠加，同时可以将不同目录挂载到同一个虚拟文件系统下(unite several directories into a single virtual filesystem)。</p><p>Union 文件系统是 Docker 镜像的基础。镜像可以通过分层来进行继承，基于基础镜像（没有父镜像），可以制作各种具体的应用镜像。</p><p>特性：一次同时加载多个文件系统，但从外面看起来，只能看到一个文件系统，联合加载会把各层文件系统叠加起来，这样最终的文件系统会包含所有底层的文件和目录。</p><p>后来出现的docker版本中，除了AUFS，还支持OverlayFS、Btrfs、Device Mapper、VFS、ZFS等storage driver。</p><h3 id="docker镜像的加载原理" tabindex="-1"><a class="header-anchor" href="#docker镜像的加载原理"><span>docker镜像的加载原理</span></a></h3><p>docker的镜像实际上由一层一层的文件系统组成，这种层级的文件系统UnionFS。</p><h4 id="bootfs-boot-file-system" tabindex="-1"><a class="header-anchor" href="#bootfs-boot-file-system"><span>bootfs(boot file system)：</span></a></h4><p>bootfs(boot file system)主要包含bootloader和kernel, bootloader主要是引导加载kernel, Linux刚启动时会加载bootfs文件系统，在Docker镜像的最底层是引导文件系统bootfs。这一层与我们典型的Linux/Unix系统是一样的，包含boot加载器和内核。当boot加载完成之后整个内核就都在内存中了，此时内存的使用权已由bootfs转交给内核，此时系统也会卸载bootfs。</p><h4 id="rootfs-root-file-system" tabindex="-1"><a class="header-anchor" href="#rootfs-root-file-system"><span>rootfs (root file system) ：</span></a></h4><p>在bootfs之上。包含的就是典型 Linux 系统中的 /dev, /proc, /bin, /etc 等标准目录和文件。rootfs就是各种不同的操作系统发行版，比如Ubuntu，Centos等等。</p><p><img src="'+t+'" alt="img.png"></p><p>对于一个精简的OS，rootfs可以很小，只需要包括最基本的命令、工具和程序库就可以了，因为底层直接用Host的kernel，自己只需要提供 rootfs 就行了。由此可见对于不同的linux发行版, bootfs基本是一致的, rootfs会有差别, 因此不同的发行版可以公用bootfs。</p><p>不同rootfs： <img src="'+l+`" alt="img.png"></p><h3 id="镜像分层-1" tabindex="-1"><a class="header-anchor" href="#镜像分层-1"><span>镜像分层</span></a></h3><p>镜像分层最大的一个好处就是共享资源，方便复制迁移，就是为了复用。</p><p>比如说有多个镜像都从相同的 base 镜像构建而来，那么 Docker Host 只需在磁盘上保存一份 base 镜像； 同时内存中也只需加载一份 base 镜像，就可以为所有容器服务了。而且镜像的每一层都可以被共享。</p><p>Docker支持扩展现有镜像，创建新的镜像。新镜像是从base镜像一层一层叠加生成的。</p><div class="language-shell line-numbers-mode" data-ext="shell" data-title="shell"><button class="copy" title="复制代码" data-copied="已复制"></button><pre class="shiki shiki-themes vitesse-light vitesse-dark vp-code"><code><span class="line"><span style="--shiki-light:#A0ADA0;--shiki-dark:#758575DD;"># Version: 0.0.1</span></span>
<span class="line"><span style="--shiki-light:#59873A;--shiki-dark:#80A665;">FROM</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> debian</span><span style="--shiki-light:#A0ADA0;--shiki-dark:#758575DD;">  # 直接在debain base镜像上构建</span></span>
<span class="line"><span style="--shiki-light:#59873A;--shiki-dark:#80A665;">MAINTAINER</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> mylinux</span></span>
<span class="line"><span style="--shiki-light:#59873A;--shiki-dark:#80A665;">RUN</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> apt-get</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> update</span><span style="--shiki-light:#999999;--shiki-dark:#666666;"> &amp;&amp;</span><span style="--shiki-light:#59873A;--shiki-dark:#80A665;"> apt-get</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> install</span><span style="--shiki-light:#A65E2B;--shiki-dark:#C99076;"> -y</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> emacs</span><span style="--shiki-light:#A0ADA0;--shiki-dark:#758575DD;"> # 安装emacs</span></span>
<span class="line"><span style="--shiki-light:#59873A;--shiki-dark:#80A665;">RUN</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> apt-get</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> install</span><span style="--shiki-light:#A65E2B;--shiki-dark:#C99076;"> -y</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;"> apache2</span><span style="--shiki-light:#A0ADA0;--shiki-dark:#758575DD;"> # 安装apache2</span></span>
<span class="line"><span style="--shiki-light:#59873A;--shiki-dark:#80A665;">CMD</span><span style="--shiki-light:#393A34;--shiki-dark:#DBD7CAEE;"> [</span><span style="--shiki-light:#B5695977;--shiki-dark:#C98A7D77;">&quot;</span><span style="--shiki-light:#B56959;--shiki-dark:#C98A7D;">/bin/bash</span><span style="--shiki-light:#B5695977;--shiki-dark:#C98A7D77;">&quot;</span><span style="--shiki-light:#393A34;--shiki-dark:#DBD7CAEE;">] </span><span style="--shiki-light:#A0ADA0;--shiki-dark:#758575DD;"># 容器启动时运行bash</span></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>镜像创建过程：</p><p><img src="`+o+'" alt="image-.png"></p><h3 id="容器层" tabindex="-1"><a class="header-anchor" href="#容器层"><span>容器层</span></a></h3><p>当容器启动时，一个新的<strong>可写层</strong>将被加载到镜像的顶部，这一层通常被称为<code>容器层</code>，容器层之下的都叫<code>镜像层</code>。</p><p>所有对容器的改动，无论添加、删除、还是修改文件都只会发生在容器层中。</p><p>只有容器层是可写的，容器层下面的所有镜像层都是只读的。</p><p><img src="'+p+'" alt="container-layer.png"></p><h3 id="镜像分层的优点" tabindex="-1"><a class="header-anchor" href="#镜像分层的优点"><span>镜像分层的优点</span></a></h3><p>镜像分层最大的一个好处就是共享资源，方便复制迁移，就是为了复用。</p><p>比如说有多个镜像都从相同的 base 镜像构建而来，那么 Docker Host 只需在磁盘上保存一份 base 镜像； 同时内存中也只需加载一份 base 镜像，就可以为所有容器服务了。而且镜像的每一层都可以被共享。</p>',34)]))}const k=i(r,[["render",h],["__file","index.html.vue"]]),m=JSON.parse(`{"path":"/devops/images/Loading/principle/","title":"docker镜像加载原理","lang":"zh-CN","frontmatter":{"title":"docker镜像加载原理","createTime":"2025/02/16 23:07:35","permalink":"/devops/images/Loading/principle/","head":[["script",{"id":"check-dark-mode"},";(function () {const um= localStorage.getItem('vuepress-theme-appearance') || 'auto';const sm = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;if (um === 'dark' || (um !== 'light' && sm)) {document.documentElement.classList.add('dark');}})();"],["script",{"id":"check-mac-os"},"document.documentElement.classList.toggle('mac', /Mac|iPhone|iPod|iPad/i.test(navigator.platform))"]]},"headers":[{"level":3,"title":"镜像本质","slug":"镜像本质","link":"#镜像本质","children":[]},{"level":3,"title":"联合文件系统","slug":"联合文件系统","link":"#联合文件系统","children":[]},{"level":3,"title":"docker镜像的加载原理","slug":"docker镜像的加载原理","link":"#docker镜像的加载原理","children":[]},{"level":3,"title":"镜像分层","slug":"镜像分层-1","link":"#镜像分层-1","children":[]},{"level":3,"title":"容器层","slug":"容器层","link":"#容器层","children":[]},{"level":3,"title":"镜像分层的优点","slug":"镜像分层的优点","link":"#镜像分层的优点","children":[]}],"readingTime":{"minutes":3.94,"words":1183},"git":{"createdTime":1739718420000,"updatedTime":1740582875000,"contributors":[{"name":"yongjun","email":"1640808365@qq.com","commits":3}]},"filePathRelative":"notes/devops/docker/docker镜像加载原理.md"}`);export{k as comp,m as data};
