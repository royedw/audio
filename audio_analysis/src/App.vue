<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
    <header>
        <!-- <nav>
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/about">About</RouterLink>
            <RouterLink to="/analysis">Analysis</RouterLink>
        </nav> -->
    </header>

    <lay-container fluid id="router-container-fluid">
        <div class="router-container">
            <RouterView />
        </div>
    </lay-container>
</template>

<style scoped>
.router-container {
    height: 100vh;
    width: 100vw;
}

#router-container-fluid {
    padding: 0;
}

header {
    line-height: 1.5;
    max-height: 100vh;
}

nav {
    width: 100%;
    font-size: 12px;
    text-align: center;
    margin-top: 2rem;
}

nav a {
    display: inline-block;
    padding: 0 1rem;
    border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
    border: 0;
}
</style>
